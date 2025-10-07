import { DEFAULT_MODEL } from '@/ai/constants'
import { NextResponse } from 'next/server'
import { checkBotId } from 'botid/server'
import { generateObject } from 'ai'
import { linesSchema, resultSchema } from '@/components/error-monitor/schemas'
import { getAvailableModels, getModelOptions } from '@/ai/gateway'
import prompt from './prompt.md'

export async function POST(req: Request) {
  const checkResult = await checkBotId()
  if (checkResult.isBot) {
    return NextResponse.json({ error: `Bot detected` }, { status: 403 })
  }

  const body = await req.json()
  const parsedBody = linesSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json({ error: `Invalid request` }, { status: 400 })
  }

  const allModels = await getAvailableModels()
  const selectedModel =
    allModels.find((m: { id: string; name: string }) => m.id === DEFAULT_MODEL) ??
    allModels[0]
  if (!selectedModel) {
    return NextResponse.json(
      { error: 'No models available. Check OPENAI_API_KEY/OPENAI_BASE_URL.' },
      { status: 500 }
    )
  }
  const effectiveModelId = selectedModel.id

  const result = await generateObject({
    ...getModelOptions(effectiveModelId, { reasoningEffort: 'minimal' }),
    system: prompt,
    messages: [{ role: 'user', content: JSON.stringify(parsedBody.data) }],
    schema: resultSchema,
  })

  return NextResponse.json(result.object, {
    status: 200,
  })
}
