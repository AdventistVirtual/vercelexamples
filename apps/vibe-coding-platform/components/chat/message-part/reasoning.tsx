import type { ReasoningUIPart } from 'ai'
import { MarkdownRenderer } from '@/components/markdown-renderer/markdown-renderer'
import { MessageSpinner } from '../message-spinner'
import { useReasoningContext } from '../message'
import { memo } from 'react'

export const Reasoning = memo(function Reasoning({
  part,
  partIndex,
}: {
  part: ReasoningUIPart
  partIndex: number
}) {
  const context = useReasoningContext()
  const isExpanded = context?.expandedReasoningIndex === partIndex

  if (part.state === 'done' && !part.text) {
    return null
  }

  const text = part.text || '_Thinking_'
  const isStreaming = part.state === 'streaming'

  const handleClick = () => {
    if (context) {
      const newIndex = isExpanded ? null : partIndex
      context.setExpandedReasoningIndex(newIndex)
    }
  }

  return (
    <div
      className="text-sm border border-border bg-background rounded-md cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={handleClick}
      role="button"
      aria-expanded={isExpanded ? 'true' : 'false'}
      aria-label="Toggle thinking details"
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="text-secondary-foreground font-mono font-bold">
            Thinking
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && <MessageSpinner />}
            <span className="select-none text-secondary-foreground">
              {isExpanded ? '▾' : '▸'}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2 text-secondary-foreground font-mono leading-normal">
            {isStreaming ? (
              <div className="whitespace-pre-wrap break-words">
                {text}
              </div>
            ) : (
              <MarkdownRenderer content={text} />
            )}
            {isStreaming && <MessageSpinner className="mt-2" />}
          </div>
        )}
      </div>
    </div>
  )
}, (prev, next) => {
  // Avoid unnecessary re-renders if nothing visible changed
  return (
    prev.partIndex === next.partIndex &&
    prev.part.state === next.part.state &&
    (prev.part.text || '') === (next.part.text || '')
  )
})
