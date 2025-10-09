import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { Sandbox } from '@e2b/code-interpreter'
import { getRichError } from './get-rich-error'
import { registerSandbox } from './sandbox-registry'
import { tool } from 'ai'
import description from './create-sandbox.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export const createSandbox = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      timeout: z
        .number()
        .min(600000)
        .max(2700000)
        .optional()
        .describe(
          'Maximum time in milliseconds the E2B Sandbox will remain active before automatically shutting down. Minimum 600000ms (10 minutes), maximum 2700000ms (45 minutes). Defaults to 600000ms (10 minutes). The sandbox will terminate all running processes when this timeout is reached.'
        ),
      ports: z
        .array(z.number())
        .max(2)
        .optional()
        .describe(
          'Array of network ports you plan to access from outside the E2B Sandbox. Services running inside the sandbox can be reached externally via sandbox.getHost(port). Common ports include 3000 (Next.js), 8000 (Python servers), 5000 (Flask), etc.'
        ),
    }),
    execute: async ({ timeout, ports }, { toolCallId }) => {
      writer.write({
        id: toolCallId,
        type: 'data-create-sandbox',
        data: { status: 'loading' },
      })

      try {
        const sandbox = await Sandbox.create()
        if (timeout) {
          // E2B JS SDK: set sandbox timeout in milliseconds
          await Sandbox.setTimeout(sandbox.sandboxId, timeout)
        }

        // Ensure ports are resolved at creation time.
        // Default to exposing port 3000 if none provided.
        const exposePorts = Array.isArray(ports) && ports.length > 0 ? ports.slice(0, 2) : [3000]
        const portHosts: Record<number, string> = {}

        for (const p of exposePorts) {
          try {
            const host = await sandbox.getHost(p)
            portHosts[p] = `https://${host}`
          } catch (_e) {
            // ignore exposure errors; user can retry getSandboxURL later
          }
        }

        const urlsSummary =
          Object.keys(portHosts).length > 0
            ? '\nURLs:\n' +
              Object.entries(portHosts)
                .map(([p, u]) => `  - Port ${p}: ${u}`)
                .join('\n')
            : ''

        // Register sandbox instance for later retrieval by ID
        registerSandbox(sandbox)

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: { sandboxId: sandbox.sandboxId, status: 'done' },
        })

        return (
          `Sandbox created with ID: ${sandbox.sandboxId}.` +
          `\nPorts exposed: ${exposePorts.join(', ')}.` +
          urlsSummary +
          `\nYou can now upload files, run commands, and access services on the exposed ports.`
        )
      } catch (error) {
        const richError = getRichError({
          action: 'Creating Sandbox',
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-create-sandbox',
          data: {
            error: { message: richError.error.message },
            status: 'error',
          },
        })

        console.log('Error creating Sandbox:', richError.error)
        return richError.message
      }
    },
  })
