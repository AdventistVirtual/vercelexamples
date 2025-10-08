import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { getSandbox } from './sandbox-registry'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './run-command.md'
import z from 'zod/v3'
import {
  appendChunk,
  createStream,
  finishStream,
  getStream,
  beginInstallGate,
  waitForInstallIdle,
} from './command-registry'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

function normalizePackageManager(command: string, args: string[]) {
  // Enforce npm usage in sandbox; map pnpm->npm and pnpm dlx->npx
  const out = { command, args: [...args] }
  if (out.command === 'pnpm') {
    if (out.args[0] === 'dlx') {
      out.command = 'npx'
      out.args.shift()
    } else {
      out.command = 'npm'
    }
  }
  return out
}

/**
 * Heuristics to detect commands that are likely long-running in an E2B sandbox
 * and should NOT be executed in the foreground (wait: true).
 *
 * Examples:
 * - npm install / npm ci
 * - npm run dev / npm start / npm run serve / npm run preview
 * - npx next dev / npx vite dev / npx vercel dev
 */
function isPotentiallyLongRunning(command: string, args: string[]) {
  const c = (command || '').toLowerCase()
  const a0 = (args[0] || '').toLowerCase()
  const a1 = (args[1] || '').toLowerCase()

  const devAliases = new Set(['dev', 'start', 'serve', 'preview'])

  if (c === 'npm' || c === 'yarn' || c === 'npx') {
    // Installs are long-running and should be backgrounded
    if (a0 === 'install' || a0 === 'ci') return true

    // npm script runners
    if (a0 === 'run' && devAliases.has(a1)) return true
    if (devAliases.has(a0)) return true

    // Common npx dev starters
    if (c === 'npx') {
      const starters = new Set(['next', 'vite', 'vercel'])
      if (starters.has(a0) && devAliases.has(a1)) return true
    }
  }

  return false
}

function classifyCommandKind(
  command: string,
  args: string[]
): 'install' | 'dev' | 'normal' {
  const c = (command || '').toLowerCase()
  const a0 = (args[0] || '').toLowerCase()
  const a1 = (args[1] || '').toLowerCase()

  const devAliases = new Set(['dev', 'start', 'serve', 'preview'])

  // Install commands
  if ((c === 'npm' || c === 'yarn') && (a0 === 'install' || a0 === 'ci')) {
    return 'install'
  }

  // Dev servers via npm scripts
  if (c === 'npm' || c === 'yarn') {
    if ((a0 === 'run' && devAliases.has(a1)) || devAliases.has(a0)) {
      return 'dev'
    }
  }

  // Common npx starters
  if (c === 'npx') {
    const starters = new Set(['next', 'vite', 'vercel'])
    if (starters.has(a0) && devAliases.has(a1)) {
      return 'dev'
    }
  }

  return 'normal'
}

function toShellString(cmd: string, args: string[], sudo?: boolean) {
  const parts = [sudo ? 'sudo' : '', cmd, ...args].filter(Boolean)
  return parts.join(' ')
}

export const runCommand = ({ writer }: Params) =>
  tool({
    description,
    inputSchema: z.object({
      sandboxId: z
        .string()
        .describe('The ID of the E2B Sandbox to run the command in'),
      command: z
        .string()
        .describe(
          "The base command to run (e.g., 'npm', 'node', 'python', 'ls', 'cat'). Do NOT include arguments here. IMPORTANT: Each command runs independently in a fresh shell session - there is no persistent state between commands. You cannot use 'cd' to change directories for subsequent commands."
        ),
      args: z
        .array(z.string())
        .optional()
        .describe(
          "Array of arguments for the command. Each argument should be a separate string (e.g., ['install', '--verbose'] for npm install --verbose, or ['src/index.js'] to run a file, or ['-la', './src'] to list files). IMPORTANT: Use relative paths (e.g., 'src/file.js') or absolute paths instead of trying to change directories with 'cd' first, since each command runs in a fresh shell session."
        ),
      sudo: z
        .boolean()
        .optional()
        .describe('Whether to run the command with sudo'),
      wait: z
        .boolean()
        .describe(
          'Whether to wait for the command to finish before returning. If true, the command will block until it completes, and you will receive its output.'
        ),
    }),
    execute: async (
      { sandboxId, command, sudo, wait, args = [] },
      { toolCallId }
    ) => {
      const { command: normCommand, args: normArgs } = normalizePackageManager(command, args)
      const forceBackground = isPotentiallyLongRunning(normCommand, normArgs)
      const effectiveWait = forceBackground ? false : wait
      const bgSuffix = forceBackground ? ' (forced to run in background due to long-running command)' : ''
      const cmdLine = toShellString(normCommand, normArgs, sudo)

      writer.write({
        id: toolCallId,
        type: 'data-run-command',
        data: { sandboxId, command: normCommand, args: normArgs, status: 'executing' },
      })

      const sandbox = getSandbox(sandboxId)
      if (!sandbox) {
        const richError = getRichError({
          action: 'get sandbox by id',
          args: { sandboxId },
          error: new Error('Sandbox not found'),
        })

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            command: normCommand,
            args: normArgs,
            error: richError.error,
            status: 'error',
          },
        })

        return richError.message
      }

      try {
        // Background: non-blocking, attach streaming callbacks and expose kill()
        if (!effectiveWait) {
          const startedAt = Date.now()
          const commandId = crypto.randomUUID()
          const kind = classifyCommandKind(normCommand, normArgs)

          // Initialize stream BEFORE starting the job to avoid callback race on first chunk
          createStream(sandboxId, commandId, startedAt, undefined, kind)

          // If an install is in progress, block subsequent commands until it finishes
          if (kind !== 'install') {
            await waitForInstallIdle(sandboxId)
          } else {
            // Mark this command as the active install gate
            beginInstallGate(sandboxId, commandId)
          }

          // Start the background job with streaming
          // Note: E2B commands.run accepts a single shell string; we pass background and streaming callbacks
          const cmdHandle = await (sandbox as any).commands.run(cmdLine, {
            background: true,
            onStdout: (data: any) => {
              const text = typeof data === 'string' ? data : data?.text ?? ''
              if (text) appendChunk(sandboxId, commandId, text, 'stdout')
            },
            onStderr: (data: any) => {
              const text = typeof data === 'string' ? data : data?.text ?? ''
              if (text) appendChunk(sandboxId, commandId, text, 'stderr')
            },
          })

          // Attach kill handle after job starts
          const streamRef = getStream(sandboxId, commandId)
          if (streamRef) {
            streamRef.handle = { kill: () => cmdHandle?.kill?.() }
          }

          writer.write({
            id: toolCallId,
            type: 'data-run-command',
            data: {
              sandboxId,
              commandId,
              command: normCommand,
              args: normArgs,
              status: 'running',
            },
          })

          // Detach a watcher to finish stream with exit code when it ends
          ;(async () => {
            let exitCode: number | undefined = undefined
            try {
              // Try common result methods; ignore if not available
              const res =
                (await cmdHandle?.result?.()) ??
                (await cmdHandle?.wait?.()) ??
                undefined
              exitCode = res?.exitCode ?? res?.code ?? exitCode
            } catch {
              // ignore
            } finally {
              finishStream(sandboxId, commandId, exitCode)
            }
          })().catch(() => {
            // ignore detached watcher errors
          })

          return `The command \`${normCommand} ${normArgs.join(
            ' '
          )}\` has been started in the background in the sandbox with ID \`${sandboxId}\` with the commandId ${commandId}.${bgSuffix}`
        }

        // Foreground: stream while awaiting completion
        const startedAt = Date.now()
        const commandId = crypto.randomUUID()
        const kind = classifyCommandKind(normCommand, normArgs)
        createStream(sandboxId, commandId, startedAt, undefined, kind)

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            commandId,
            command: normCommand,
            args: normArgs,
            status: 'waiting',
          },
        })

        // Serialize foreground execution behind any active install
        await waitForInstallIdle(sandboxId)
          if (kind === 'install') {
            beginInstallGate(sandboxId, commandId)
          }

        const result = await (sandbox as any).commands.run(cmdLine, {
          onStdout: (data: any) => {
            const text = typeof data === 'string' ? data : data?.text ?? ''
            if (text) appendChunk(sandboxId, commandId, text, 'stdout')
          },
          onStderr: (data: any) => {
            const text = typeof data === 'string' ? data : data?.text ?? ''
            if (text) appendChunk(sandboxId, commandId, text, 'stderr')
          },
        })

        const exitCode: number = result?.exitCode ?? result?.code ?? 0
        finishStream(sandboxId, commandId, exitCode)

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            commandId,
            command: normCommand,
            args: normArgs,
            exitCode,
            status: 'done',
          },
        })

        return `The command \`${normCommand} ${normArgs.join(
          ' '
        )}\` has finished with exit code ${exitCode}.`
      } catch (error) {
        const richError = getRichError({
          action: 'run command in sandbox',
          args: { sandboxId },
          error,
        })

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            command,
            args,
            error: richError.error,
            status: 'error',
          },
        })

        return richError.message
      }
    },
  })
