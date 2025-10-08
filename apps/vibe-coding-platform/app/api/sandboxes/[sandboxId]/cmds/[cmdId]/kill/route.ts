import { NextResponse, type NextRequest } from 'next/server'
import { getStream, killCommand } from '../../../../../../../ai/tools/command-registry'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { sandboxId, cmdId } = await params

  const stream = getStream(sandboxId, cmdId)
  if (!stream) {
    return NextResponse.json(
      { error: 'Command stream not found', sandboxId, cmdId },
      { status: 404 }
    )
  }

  try {
    await killCommand(sandboxId, cmdId)
    return NextResponse.json({ ok: true, sandboxId, cmdId })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Failed to kill command' },
      { status: 500 }
    )
  }
}