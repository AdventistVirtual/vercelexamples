import { NextRequest, NextResponse } from 'next/server'
import { getSandbox } from '@/ai/tools/sandbox-registry'

/**
 * Checks the status of an E2B Sandbox by attempting a trivial code execution.
 * If the sandbox is reachable and can execute code, it's considered 'running'.
 * Otherwise, we report 'stopped'.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params

  const sandbox = getSandbox(sandboxId)
  if (!sandbox) {
    return NextResponse.json({ status: 'stopped' })
  }

  try {
    await (sandbox as any).runCode('print("sandbox status check")', { language: 'python' })
    return NextResponse.json({ status: 'ok' })
  } catch (_error) {
    return NextResponse.json({ status: 'stopped' })
  }
}
