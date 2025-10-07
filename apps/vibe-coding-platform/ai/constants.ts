export enum Models {
  // Optional special-case for gating reasoning UI; won't be listed unless your API provides this ID.
  OpenAIGPT5 = 'gpt-5',
}

// Default model for the app; can be overridden at build/runtime via Next public env.
// Example: NEXT_PUBLIC_OPENAI_DEFAULT_MODEL=gpt-4o-mini
export const DEFAULT_MODEL =
  process.env.NEXT_PUBLIC_OPENAI_DEFAULT_MODEL || 'gpt-4o-mini'

export const TEST_PROMPTS = [
  'Generate a Next.js app that allows to list and search Pokemons',
  'Create a `golang` server that responds with "Hello World" to any request',
]
