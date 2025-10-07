'use client'

import { Button } from '@/components/ui/button'
import { ArrowDownIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import { cn } from '@/lib/utils'

export type ConversationProps = ComponentProps<typeof StickToBottom>

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn('relative flex-1 overflow-y-auto', className)}
    initial="auto"
    resize="auto"
    role="log"
    {...props}
  />
)

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content className={cn('p-4', className)} {...props} />
)

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  return (
    !isAtBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  )
}

/**
 * Auto-scrolls to bottom while active is true and the user is currently at the bottom.
 * Usage: render inside <Conversation> and pass a changing tick (e.g. message/part count).
 */
export function AutoScroll({ active, tick }: { active: boolean; tick: number }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  // Scroll only when new content arrives and the user is at the bottom.
  // Double-RAF avoids sync layout thrash during streaming updates.
  useEffect(() => {
    if (!active || !isAtBottom) return
    const id1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          scrollToBottom()
        } catch {
          // no-op
        }
      })
    })
    return () => cancelAnimationFrame(id1)
  }, [active, tick, isAtBottom, scrollToBottom])

  return null
}
