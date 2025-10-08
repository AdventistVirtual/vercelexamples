/**
* Registry for tracking E2B background/foreground command executions,
* streaming logs with line normalization, exposing kill(), and status.
*/
export type CommandLogLine = {
 data: string
 stream: 'stdout' | 'stderr'
 timestamp: number
}

type CommandHandleRef = {
 kill: () => Promise<void> | void
}

type CommandStream = {
 logs: CommandLogLine[]
 done: boolean
 exitCode?: number
 subscribers: Set<(line: CommandLogLine) => void>
 startedAt: number
 stdoutBuf: string
 stderrBuf: string
 handle?: CommandHandleRef
 kind?: 'install' | 'dev' | 'normal'
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

/**
 * Per-sandbox install gate to serialize commands until an install finishes.
 */
const installGates = new Map<string, { activeCmdId?: string; waiters: Set<() => void>; pending: boolean }>()

export function beginInstallGate(sandboxId: string, cmdId: string) {
 let gate = installGates.get(sandboxId)
 if (!gate) {
   gate = { activeCmdId: cmdId, waiters: new Set(), pending: true }
   installGates.set(sandboxId, gate)
 } else {
   gate.activeCmdId = cmdId
   gate.pending = true
 }
}

export function setInstallPending(sandboxId: string, pending: boolean) {
 let gate = installGates.get(sandboxId)
 if (!gate) {
   gate = { activeCmdId: undefined, waiters: new Set(), pending }
   installGates.set(sandboxId, gate)
 } else {
   gate.pending = pending
 }
}

export async function waitForInstallIdle(sandboxId: string): Promise<void> {
 const gate = installGates.get(sandboxId)
 if (!gate?.activeCmdId && !gate?.pending) return
 await new Promise<void>((resolve) => {
   gate!.waiters.add(resolve)
 })
}

export function endInstallGate(sandboxId: string, cmdId: string) {
 const gate = installGates.get(sandboxId)
 if (!gate?.activeCmdId) return
 if (gate.activeCmdId !== cmdId) return
 gate.activeCmdId = undefined
 gate.pending = false
 for (const resolve of gate.waiters) {
   try {
     resolve()
   } catch {}
 }
 gate.waiters.clear()
}

/**
* Initialize a command stream entry.
*/
export function createStream(
 sandboxId: string,
 cmdId: string,
 startedAt: number,
 handle?: CommandHandleRef,
 kind?: 'install' | 'dev' | 'normal'
) {
 const sandboxMap = ensureSandboxMap(sandboxId)
 sandboxMap.set(cmdId, {
   logs: [],
   done: false,
   subscribers: new Set(),
   startedAt,
   stdoutBuf: '',
   stderrBuf: '',
   handle,
   kind,
 })
}

/**
* Get a stream record.
*/
export function getStream(sandboxId: string, cmdId: string): CommandStream | undefined {
 const sandboxMap = registry.get(sandboxId)
 return sandboxMap?.get(cmdId)
}

/**
* Append a fully formed log line and notify subscribers.
*/
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

/**
* Append chunk data, normalizing to lines without losing partials.
* Ensures per-stream ordering; timestamps added on arrival.
*/
export function appendChunk(
 sandboxId: string,
 cmdId: string,
 data: string,
 which: 'stdout' | 'stderr'
) {
 const stream = getStream(sandboxId, cmdId)
 if (!stream) return
 const bufKey = which === 'stdout' ? 'stdoutBuf' : 'stderrBuf'
 const combined = (stream[bufKey] ?? '') + data
 const parts = combined.split(/\r?\n/)
 const remainder = parts.pop() ?? ''
 const now = Date.now()

 for (const part of parts) {
   // Preserve newline between lines in UI body concatenation
   appendLine(sandboxId, cmdId, { data: part + '\n', stream: which, timestamp: now })
 }
 stream[bufKey] = remainder
}

/**
* Flush any remaining buffered partial line as a final line.
*/
export function flushBuffers(sandboxId: string, cmdId: string) {
 const stream = getStream(sandboxId, cmdId)
 if (!stream) return
 const now = Date.now()
 if (stream.stdoutBuf) {
   appendLine(sandboxId, cmdId, { data: stream.stdoutBuf, stream: 'stdout', timestamp: now })
   stream.stdoutBuf = ''
 }
 if (stream.stderrBuf) {
   appendLine(sandboxId, cmdId, { data: stream.stderrBuf, stream: 'stderr', timestamp: now })
   stream.stderrBuf = ''
 }
}

/**
* Mark stream finished and store exit code. Flush any trailing buffers.
*/
export function finishStream(sandboxId: string, cmdId: string, exitCode?: number) {
 const stream = getStream(sandboxId, cmdId)
 if (!stream) return
 flushBuffers(sandboxId, cmdId)
 stream.done = true
 stream.exitCode = exitCode
 // Clear install gate if this stream was an install
 if (stream.kind === 'install') {
   endInstallGate(sandboxId, cmdId)
 }
}

/**
* Subscribe to new lines. Returns an unsubscribe function.
*/
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

/**
* Retrieve existing backlog of lines for initial replay.
*/
export function getBacklog(sandboxId: string, cmdId: string): CommandLogLine[] {
 const stream = getStream(sandboxId, cmdId)
 return stream?.logs ?? []
}

/**
* List command IDs for a sandbox.
*/
export function listSandboxCommands(sandboxId: string): string[] {
 const sandboxMap = registry.get(sandboxId)
 if (!sandboxMap) return []
 return Array.from(sandboxMap.keys())
}

/**
* Kill a running command if a handle is available.
*/
export async function killCommand(sandboxId: string, cmdId: string): Promise<void> {
 const stream = getStream(sandboxId, cmdId)
 if (!stream?.handle?.kill) return
 try {
   await stream.handle.kill()
 } catch {
   // swallow kill errors
 } finally {
   // Ensure stream finalized; will also release install gate if applicable
   finishStream(sandboxId, cmdId, undefined)
 }
}

/**
* Lightweight status snapshot for UI/API.
*/
export function getStatus(sandboxId: string, cmdId: string):
 | { startedAt: number; exitCode?: number; done: boolean }
 | undefined {
 const stream = getStream(sandboxId, cmdId)
 if (!stream) return undefined
 return { startedAt: stream.startedAt, exitCode: stream.exitCode, done: stream.done }
}

/**
* Remove a stream record.
*/
export function removeStream(sandboxId: string, cmdId: string) {
 const sandboxMap = registry.get(sandboxId)
 sandboxMap?.delete(cmdId)
}