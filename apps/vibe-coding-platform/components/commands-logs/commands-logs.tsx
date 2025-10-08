'use client'

import type { Command } from './types'
import { Panel, PanelHeader } from '@/components/panels/panels'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SquareChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  className?: string
  commands: Command[]
}

export function CommandsLogs(props: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [props.commands])

  async function killCommand(sandboxId: string, cmdId: string) {
    try {
      await fetch(`/api/sandboxes/${sandboxId}/cmds/${cmdId}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch {
      // ignore UI kill errors
    }
  }

  return (
    <Panel className={props.className}>
      <PanelHeader>
        <SquareChevronRight className="mr-2 w-4" />
        <span className="font-mono uppercase font-semibold">
          Sandbox Remote Output
        </span>
      </PanelHeader>
      <div className="h-[calc(100%-2rem)]">
        <ScrollArea className="h-full">
          <div className="p-2 space-y-2">
            {props.commands.map((command) => {
              const date = new Date(command.startedAt).toLocaleTimeString(
                'en-US',
                {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }
              )

              const line = `${command.command} ${command.args.join(' ')}`
              const body = command.logs?.map((log) => log.data).join('') || ''

              const running = typeof command.exitCode === 'undefined'
              const canCancel = command.background && running

              return (
                <div key={command.cmdId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      [{date}] {line}
                    </span>
                    <div className="flex items-center gap-2">
                      {running && (
                        <span className="font-mono text-xs text-yellow-600">
                          running
                        </span>
                      )}
                      {!running && (
                        <span className="font-mono text-xs text-green-600">
                          exit {command.exitCode ?? 0}
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canCancel}
                        onClick={() => killCommand(command.sandboxId, command.cmdId)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-sm">
                    {body}
                  </pre>
                </div>
              )
            })}
          </div>
          <div ref={bottomRef} />
        </ScrollArea>
      </div>
    </Panel>
  )
}
