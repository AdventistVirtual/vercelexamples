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
  const shortTitle = (() => {
    const firstLine = (text || '').split(/\r?\n/)[0]?.trim() || ''
    const cleaned = firstLine
      .replace(/^#{1,6}\s*/, '')
      .replace(/[*_`~]/g, '')
    return cleaned
  })()
  const bodyText = (() => {
    if (!text) return ''
    const idx = text.indexOf('\n')
    if (idx === -1) return ''
    return text.slice(idx + 1).trimStart()
  })()

  const handleClick = () => {
    if (context) {
      const newIndex = isExpanded ? null : partIndex
      context.setExpandedReasoningIndex(newIndex)
    }
  }

  return (
    <div
      className="text-sm border border-border bg-background rounded-md transition-colors"
    >
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-secondary-foreground font-mono font-bold p-1 -m-1 rounded hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-accent text-left"
            aria-label={isExpanded ? 'Collapse thinking details' : 'Expand thinking details'}
            aria-expanded={isExpanded ? 'true' : 'false'}
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
          >
            {shortTitle ? `Thinking - ${shortTitle}` : 'Thinking'}
          </button>
          <div className="flex items-center gap-2">
            {isStreaming && <MessageSpinner />}
            <button
              type="button"
              className="select-none text-secondary-foreground p-1 -m-1 rounded hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label={isExpanded ? 'Collapse thinking details' : 'Expand thinking details'}
              aria-expanded={isExpanded ? 'true' : 'false'}
              onClick={(e) => { e.stopPropagation(); handleClick(); }}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-2 text-secondary-foreground font-mono leading-normal">
            {isStreaming ? (
              <div className="whitespace-pre-wrap break-words">
                {bodyText}
              </div>
            ) : (
              <MarkdownRenderer content={bodyText} />
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
