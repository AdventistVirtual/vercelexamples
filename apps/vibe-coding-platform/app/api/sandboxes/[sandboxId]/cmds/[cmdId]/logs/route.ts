import { NextResponse, type NextRequest } from 'next/server'
import {
  getBacklog,
  subscribe,
  getStatus,
  getStream,
} from '../../../../../../../ai/tools/command-registry'

interface Params {
  sandboxId: string
  cmdId: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const { sandboxId, cmdId } = await params

  // Ensure the stream exists (created when command starts)
  const stream = getStream(sandboxId, cmdId)
  if (!stream) {
    return NextResponse.json(
      { error: 'Command stream not found', sandboxId, cmdId },
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
      start(controller) {
        const encoder = new TextEncoder()

        // Send backlog first (already normalized lines)
        try {
          const backlog = getBacklog(sandboxId, cmdId)
          for (const line of backlog) {
            controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
          }
        } catch {
          // ignore backlog errors
        }

        // Subscribe to new lines
        const unsubscribe = subscribe(sandboxId, cmdId, (line) => {
          if (aborted) return
          try {
            controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'))
          } catch {
            // client closed; cleanup
            try {
              unsubscribe()
            } catch {}
          }
        })

        // Heartbeat + completion watcher
        const interval = setInterval(() => {
          if (aborted) {
            clearInterval(interval)
            try {
              unsubscribe()
            } catch {}
            try {
              controller.close()
            } catch {}
            return
          }
          const status = getStatus(sandboxId, cmdId)
          if (status?.done) {
            clearInterval(interval)
            try {
              unsubscribe()
            } catch {}
            try {
              controller.close()
            } catch {}
            return
          }
          try {
            controller.enqueue(encoder.encode('\n')) // heartbeat
          } catch {
            clearInterval(interval)
            try {
              unsubscribe()
            } catch {}
          }
        }, 500)
      },
      cancel() {
        aborted = true
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  )
}
