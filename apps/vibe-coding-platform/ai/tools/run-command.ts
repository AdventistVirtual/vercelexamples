import type { UIMessageStreamWriter, UIMessage } from 'ai'
import type { DataPart } from '../messages/data-parts'
import { getSandbox } from './sandbox-registry'
import { getRichError } from './get-rich-error'
import { tool } from 'ai'
import description from './run-command.md'
import z from 'zod/v3'

interface Params {
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

function buildForegroundPython(command: string, args: string[], sudo?: boolean) {
  const cmdArray = [sudo ? 'sudo' : undefined, command, ...args].filter(Boolean)
  const py = `
import subprocess, json
cmd = ${JSON.stringify(cmdArray)}
res = subprocess.run(cmd, capture_output=True, text=True)
print(json.dumps({"exitCode": res.returncode, "stdout": res.stdout, "stderr": res.stderr}))
`.trim()
  return py
}

function buildBackgroundPython(command: string, args: string[], sudo?: boolean) {
  const cmdArray = [sudo ? 'sudo' : undefined, command, ...args].filter(Boolean)
  const py = `
import subprocess, json, os, uuid, time, threading
logdir = "/tmp/e2b_cmd_logs"
os.makedirs(logdir, exist_ok=True)
cmd = ${JSON.stringify(cmdArray)}
cmd_id = str(uuid.uuid4())
out_path = os.path.join(logdir, cmd_id + ".out")
err_path = os.path.join(logdir, cmd_id + ".err")
code_path = os.path.join(logdir, cmd_id + ".code")
pid_path = os.path.join(logdir, cmd_id + ".pid")
start_path = os.path.join(logdir, cmd_id + ".start")
started_at = int(time.time() * 1000)
p = subprocess.Popen(cmd, stdout=open(out_path, "ab"), stderr=open(err_path, "ab"))
# Persist PID and start time for status queries
with open(pid_path, "w") as f:
  f.write(str(p.pid))
with open(start_path, "w") as f:
  f.write(str(started_at))
# Background watcher to write exit code when finished
def _wait_and_write():
  rc = p.wait()
  with open(code_path, "w") as f:
    f.write(str(rc))
threading.Thread(target=_wait_and_write, daemon=True).start()
print(json.dumps({"commandId": cmd_id}))
`.trim()
  return py
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
        if (!wait) {
          const py = buildBackgroundPython(normCommand, normArgs, sudo)
          const result = await (sandbox as any).runCode(py, { language: 'python' })
          const parsed = parseRunCodeJSON(result)
          const commandId = parsed?.commandId ?? String(Date.now())
 
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

          return `The command \`${normCommand} ${normArgs.join(
            ' '
          )}\` has been started in the background in the sandbox with ID \`${sandboxId}\` with the commandId ${commandId}.`
        }

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            command: normCommand,
            args: normArgs,
            status: 'waiting',
          },
        })

        const py = buildForegroundPython(normCommand, normArgs, sudo)
        const result = await (sandbox as any).runCode(py, { language: 'python' })
        const parsed = parseRunCodeJSON(result)

        if (!parsed) {
          const richError = getRichError({
            action: 'parse command output',
            args: { sandboxId, command: normCommand, args: normArgs },
            error: new Error('Failed to parse foreground execution result'),
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

        writer.write({
          id: toolCallId,
          type: 'data-run-command',
          data: {
            sandboxId,
            commandId: String(parsed.exitCode),
            command: normCommand,
            args: normArgs,
            exitCode: parsed.exitCode,
            status: 'done',
          },
        })

        return (
          `The command \`${normCommand} ${normArgs.join(
            ' '
          )}\` has finished with exit code ${parsed.exitCode}.` +
          `Stdout of the command was: \n` +
          `\`\`\`\n${parsed.stdout}\n\`\`\`\n` +
          `Stderr of the command was: \n` +
          `\`\`\`\n${parsed.stderr}\n\`\`\``
        )
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
