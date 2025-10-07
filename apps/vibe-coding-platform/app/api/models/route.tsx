import { getAvailableModels } from '@/ai/gateway'
import { NextResponse } from 'next/server'

export async function GET() {
  const allModels = await getAvailableModels()
  return NextResponse.json({
    models: allModels,
  })
}
