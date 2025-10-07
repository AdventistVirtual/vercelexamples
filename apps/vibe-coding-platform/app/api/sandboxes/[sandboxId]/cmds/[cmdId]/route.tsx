import { NextResponse, type NextRequest } from 'next/server'
import { getSandbox } from '../../../../../../ai/tools/sandbox-registry'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function GET(
  _request: NextRequest,
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

  const py = `
import os, json
logdir = "/tmp/e2b_cmd_logs"
cmd_id = ${JSON.stringify(cmdId)}
start_path = os.path.join(logdir, cmd_id + ".start")
code_path = os.path.join(logdir, cmd_id + ".code")

def read_int(path):
    try:
        with open(path, "r") as f:
            return int(f.read().strip())
    except:
        return None

started_at = read_int(start_path)
exit_code = read_int(code_path)
print(json.dumps({"startedAt": started_at, "exitCode": exit_code}))
`.trim()

  try {
    const result = await (sandbox as any).runCode(py, { language: 'python' })
    const parsed = parseRunCodeJSON(result) ?? {}
    const startedAt =
      typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now()
    const exitCode =
      typeof parsed.exitCode === 'number' ? parsed.exitCode : undefined

    return NextResponse.json({
      sandboxId: sandbox.sandboxId,
      cmdId,
      startedAt,
      exitCode,
    })
  } catch {
    return NextResponse.json({
      sandboxId: sandbox.sandboxId,
      cmdId,
      startedAt: Date.now(),
    })
  }
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
