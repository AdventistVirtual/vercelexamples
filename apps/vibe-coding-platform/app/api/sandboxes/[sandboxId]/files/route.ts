import { NextResponse, type NextRequest } from 'next/server'
import { getSandbox } from '@/ai/tools/sandbox-registry'
import z from 'zod/v3'

const FileParamsSchema = z.object({
  sandboxId: z.string(),
  path: z.string(),
})

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params
  const fileParams = FileParamsSchema.safeParse({
    path: request.nextUrl.searchParams.get('path'),
    sandboxId,
  })

  if (fileParams.success === false) {
    return NextResponse.json(
      { error: 'Invalid parameters. You must pass a `path` as query' },
      { status: 400 }
    )
  }

  const sandbox = getSandbox(fileParams.data.sandboxId)
  if (!sandbox) {
    return NextResponse.json(
      { error: 'Sandbox not found' },
      { status: 404 }
    )
  }

  // Read and return the file contents from E2B sandbox using Python + base64
  const py = `
import base64, json
p = ${JSON.stringify(fileParams.data.path)}
try:
  with open(p, "rb") as f:
    data = base64.b64encode(f.read()).decode("ascii")
  print(json.dumps({"b64": data}))
except FileNotFoundError:
  print(json.dumps({"error": "not_found"}))
`.trim()

  try {
    const exec = await (sandbox as any).runCode(py, { language: 'python' })
    const parsed = parseRunCodeJSON(exec)

    if (!parsed || parsed.error === 'not_found') {
      return NextResponse.json(
        { error: 'File not found in the Sandbox' },
        { status: 404 }
      )
    }

    const bytes = Buffer.from(parsed.b64, 'base64')
    return new NextResponse(bytes, {
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  } catch (_error) {
    return NextResponse.json(
      { error: 'Unable to read file from the Sandbox' },
      { status: 500 }
    )
  }
}
