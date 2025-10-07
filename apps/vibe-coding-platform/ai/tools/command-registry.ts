// Registry for tracking background command executions and streaming logs (E2B-based)
export type CommandLogLine = {
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
}

type CommandStream = {
  logs: CommandLogLine[]
  done: boolean
  exitCode?: number
  subscribers: Set<(line: CommandLogLine) => void>
}

const registry = new Map<string, Map<string, CommandStream>>()

function ensureSandboxMap(sandboxId: string) {
  let sandboxMap = registry.get(sandboxId)
  if (!sandboxMap) {
    sandboxMap = new Map<string, CommandStream>()
    registry.set(sandboxId, sandboxMap)
  }
  return sandboxMap
}

export function createStream(sandboxId: string, cmdId: string) {
  const sandboxMap = ensureSandboxMap(sandboxId)
  sandboxMap.set(cmdId, {
    logs: [],
    done: false,
    subscribers: new Set(),
  })
}

export function getStream(sandboxId: string, cmdId: string): CommandStream | undefined {
  const sandboxMap = registry.get(sandboxId)
  return sandboxMap?.get(cmdId)
}

export function appendLine(sandboxId: string, cmdId: string, line: CommandLogLine) {
  const stream = getStream(sandboxId, cmdId)
  if (!stream) return
  stream.logs.push(line)
  // Notify subscribers
  for (const sub of stream.subscribers) {
    try {
      sub(line)
    } catch {
      // ignore subscriber errors
    }
  }
}

export function finishStream(sandboxId: string, cmdId: string, exitCode?: number) {
  const stream = getStream(sandboxId, cmdId)
  if (!stream) return
  stream.done = true
  stream.exitCode = exitCode
}

export function subscribe(
  sandboxId: string,
  cmdId: string,
  onLine: (line: CommandLogLine) => void
): () => void {
  const stream = getStream(sandboxId, cmdId)
  if (!stream) return () => {}
  stream.subscribers.add(onLine)
  return () => {
    stream.subscribers.delete(onLine)
  }
}

export function listSandboxCommands(sandboxId: string): string[] {
  const sandboxMap = registry.get(sandboxId)
  if (!sandboxMap) return []
  return Array.from(sandboxMap.keys())
}

export function removeStream(sandboxId: string, cmdId: string) {
  const sandboxMap = registry.get(sandboxId)
  sandboxMap?.delete(cmdId)
}