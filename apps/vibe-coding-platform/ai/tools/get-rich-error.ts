/* Removed Vercel APIError import; using generic error parsing */
interface Params {
  args?: Record<string, unknown>
  action: string
  error: unknown
}

/**
 * Allows to parse a thrown error to check its metadata and construct a rich
 * message that can be handed to the LLM.
 */
export function getRichError({ action, args, error }: Params) {
  const fields = getErrorFields(error)
  let message = `Error during ${action}: ${fields.message}`
  if (args) message += `\nParameters: ${JSON.stringify(args, null, 2)}`
  if (fields.json) message += `\nJSON: ${JSON.stringify(fields.json, null, 2)}`
  if (fields.text) message += `\nText: ${fields.text}`
  return {
    message: message,
    error: fields,
  }
}

function getErrorFields(error: unknown) {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
      json: error,
    }
  } else {
    // Generic error parsing compatible with E2B responses
    const anyErr = error as any
    const json = anyErr?.json ?? anyErr
    const text = typeof anyErr?.text === 'string' ? anyErr.text : undefined

    const result: { message: string; json: unknown; text?: string } = {
      message: error.message,
      json,
    }
    if (text) result.text = text
    return result
  }
}
