import { createOpenAI } from '@ai-sdk/openai'
import { DEFAULT_MODEL, Models } from './constants'
import type { JSONValue } from 'ai'
import type { OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import type { LanguageModelV2 } from '@ai-sdk/provider'

const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export async function getAvailableModels() {
  // Query OpenAI-compatible /v1/models endpoint
  // Fallback to DEFAULT_MODEL if the API is not configured or errors
  if (!OPENAI_API_KEY) {
    return [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }]
  }

  const base = OPENAI_BASE_URL.replace(/\/$/, '')
  const res = await fetch(`${base}/models`, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    // Fallback: provide a minimal list with DEFAULT_MODEL
    return [{ id: DEFAULT_MODEL, name: DEFAULT_MODEL }]
  }

  const data = await res.json()
  const items = Array.isArray(data?.data) ? data.data : []
  return items.map((m: any) => ({
    id: m.id,
    // OpenAI 'models' response does not include a 'name' field; use id as label
    name: m.id,
  }))
}

export interface ModelOptions {
  model: LanguageModelV2
  providerOptions?: Record<string, Record<string, JSONValue>>
  headers?: Record<string, string>
}

export function getModelOptions(
  modelId: string,
  options?: { reasoningEffort?: 'minimal' | 'low' | 'medium' }
): ModelOptions {
  const openai = openaiInstance()

  if (modelId === Models.OpenAIGPT5) {
    return {
      model: openai(modelId),
      providerOptions: {
        openai: {
          include: ['reasoning.encrypted_content'],
          reasoningEffort: options?.reasoningEffort ?? 'low',
          reasoningSummary: 'auto',
          serviceTier: 'priority',
        } satisfies OpenAIResponsesProviderOptions,
      },
    }
  }

  // Default for any other OpenAI-compatible model id
  return {
    model: openai(modelId),
  }
}

function openaiInstance() {
  return createOpenAI({
    baseURL: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
  })
}
