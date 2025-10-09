// In-memory registry for E2B Sandbox instances
// Persist across Next.js HMR / route module reloads by stashing on globalThis.
import type { Sandbox as E2BSandbox } from '@e2b/code-interpreter'

const globalAny = globalThis as any
const registry: Map<string, E2BSandbox> =
  globalAny.__vibe_e2b_registry ?? new Map<string, E2BSandbox>()
globalAny.__vibe_e2b_registry = registry

export function registerSandbox(sandbox: E2BSandbox) {
  registry.set(sandbox.sandboxId, sandbox)
}

export function getSandbox(sandboxId: string): E2BSandbox | undefined {
  return registry.get(sandboxId)
}

export function unregisterSandbox(sandboxId: string) {
  registry.delete(sandboxId)
}

export function listSandboxes(): string[] {
  return Array.from(registry.keys())
}