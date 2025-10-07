import type { TextUIPart } from 'ai'
import { MarkdownRenderer } from '@/components/markdown-renderer/markdown-renderer'
import { memo } from 'react'

export const Text = memo(function Text({ part }: { part: TextUIPart }) {
  // Avoid expensive Markdown rendering while streaming
  const isStreaming = (part as any)?.state === 'streaming'
  const text = part.text

  return (
    <div
      className="text-sm px-3.5 py-3 border bg-secondary/90 text-secondary-foreground border-gray-300 rounded-md font-mono"
      aria-live="polite"
      aria-atomic="false"
    >
      {isStreaming ? (
        // Render raw text while streaming for smoother updates; preserve newlines
        <div className="whitespace-pre-wrap break-words">{text}</div>
      ) : (
        <MarkdownRenderer content={text} />
      )}
    </div>
  )
}, (prev, next) => {
  // Skip re-render if visible content/state didn't change
  const prevState = (prev.part as any)?.state
  const nextState = (next.part as any)?.state
  return prevState === nextState && prev.part.text === next.part.text
})
