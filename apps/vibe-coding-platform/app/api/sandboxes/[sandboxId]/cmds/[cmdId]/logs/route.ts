import { NextResponse, type NextRequest } from 'next/server'
import { getSandbox } from '../../../../../../../ai/tools/sandbox-registry'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { sandboxId, cmdId } = await params
  const sandbox = getSandbox(sandboxId)

  if (!sandbox) {
    return NextResponse.json(
      { error: 'Sandbox not found', sandboxId, cmdId },
      { status: 404 }
    )
  }

  // Track client aborts to stop streaming gracefully and avoid "failed to pipe response"
  let aborted = false
  request.signal.addEventListener('abort', () => {
    aborted = true
  })

  return new NextResponse(
    new ReadableStream({
      async pull(controller) {
        const encoder = new TextEncoder()
        let outOffset = 0
        let errOffset = 0

        try {
          while (true) {
            if (aborted) break

            const py = `
import os, json, base64
logdir = "/tmp/e2b_cmd_logs"
cmd_id = ${JSON.stringify(cmdId)}
out_path = os.path.join(logdir, cmd_id + ".out")
err_path = os.path.join(logdir, cmd_id + ".err")
code_path = os.path.join(logdir, cmd_id + ".code")
out_offset = ${outOffset}
err_offset = ${errOffset}

def read_chunk(path, offset):
    try:
        with open(path, "rb") as f:
            f.seek(offset)
            data = f.read()
            return {"b64": base64.b64encode(data).decode("ascii"), "next": f.tell()}
    except:
        return {"b64": "", "next": offset}

out = read_chunk(out_path, out_offset)
err = read_chunk(err_path, err_offset)

exit_code = None
try:
    with open(code_path, "r") as f:
        exit_code = int(f.read().strip())
except:
    pass

print(json.dumps({"out_b64": out["b64"], "out_next": out["next"], "err_b64": err["b64"], "err_next": err["next"], "exit_code": exit_code}))
`.trim()

            const result = await (sandbox as any).runCode(py, { language: 'python' })
            const parsed = parseRunCodeJSON(result) ?? {}
            const now = Date.now()

            const out_b64: string = parsed?.out_b64 || ''
            const err_b64: string = parsed?.err_b64 || ''
            const out_next: number =
              typeof parsed?.out_next === 'number' ? parsed.out_next : outOffset
            const err_next: number =
              typeof parsed?.err_next === 'number' ? parsed.err_next : errOffset

            if (out_b64) {
              const outData = Buffer.from(out_b64, 'base64').toString('utf-8')
              try {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      data: outData,
                      stream: 'stdout',
                      timestamp: now,
                    }) + '\n'
                  )
                )
              } catch (_e) {
                // If piping fails (e.g., client closed), stop the loop
                break
              }
            }

            if (err_b64) {
              const errData = Buffer.from(err_b64, 'base64').toString('utf-8')
              try {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      data: errData,
                      stream: 'stderr',
                      timestamp: now,
                    }) + '\n'
                  )
                )
              } catch (_e) {
                break
              }
            }

            outOffset = out_next
            errOffset = err_next

            const exitCode = parsed?.exit_code
            const noNewData = !out_b64 && !err_b64

            if (typeof exitCode === 'number' && noNewData) {
              break
            }

            // Heartbeat to keep connection alive during long idle periods
            if (noNewData) {
              try {
                // Empty line gets ignored by clients but keeps the stream active
                controller.enqueue(encoder.encode('\n'))
              } catch (_e) {
                break
              }
              await new Promise((r) => setTimeout(r, 500))
            }
          }
        } finally {
          try {
            controller.close()
          } catch {}
        }
      },
      cancel() {
        aborted = true
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  )
}

function parseRunCodeJSON(execution: any): any {
  try {
    const stdoutArr = execution?.stdout ?? execution?.execution?.stdout ?? []
    let combined = ''
    if (Array.isArray(stdoutArr)) {
      combined = stdoutArr
        .map((m: any) => {
          if (typeof m === 'string') return m
          if (typeof m?.message === 'string') return m.message
          if (typeof m?.content === 'string') return m.content
          if (Array.isArray(m?.lines)) return m.lines.join('\n')
          return ''
        })
        .join('')
    } else if (typeof stdoutArr === 'string') {
      combined = stdoutArr
    }
    return JSON.parse(combined.trim())
  } catch {
    return null
  }
}
