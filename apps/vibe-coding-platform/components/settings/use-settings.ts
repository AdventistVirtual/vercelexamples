import { parseAsBoolean, parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs'
import { DEFAULT_MODEL } from '@/ai/constants'

export function useSettings() {
  const [modelId] = useModelId()
  const [fixErrors] = useFixErrors()
  const [reasoningEffort] = useReasoningEffort()
  return { modelId, fixErrors, reasoningEffort }
}

export function useModelId() {
  return useQueryState('modelId', parseAsString.withDefault(DEFAULT_MODEL))
}

export function useReasoningEffort() {
  return useQueryState(
    'effort',
    parseAsStringLiteral(['medium', 'low']).withDefault('low')
  )
}

export function useFixErrors() {
  return useQueryState('fix-errors', parseAsBoolean.withDefault(true))
}
