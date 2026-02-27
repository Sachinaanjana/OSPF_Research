"use client"

import { useEffect, useRef } from "react"
import type { TopologyChange } from "@/lib/ospf-types"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plus,
  Minus,
  ArrowRightLeft,
  RefreshCw,
  MapPin,
  Radio,
} from "lucide-react"

interface EventLogProps {
  events: TopologyChange[]
}

const typeConfig: Record<
  string,
  { icon: typeof Plus; color: string; bg: string }
> = {
  "router-added": {
    icon: Plus,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  "router-removed": {
    icon: Minus,
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
  "link-added": {
    icon: Radio,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  "link-removed": {
    icon: Radio,
    color: "text-red-400",
    bg: "bg-red-400/10",
  },
  "metric-changed": {
    icon: ArrowRightLeft,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  "area-changed": {
    icon: MapPin,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function EventLog({ events }: EventLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <RefreshCw className="h-5 w-5 opacity-40" />
        <p className="text-xs">No topology changes detected yet.</p>
        <p className="text-xs opacity-60">
          Enable polling or paste new OSPF data to see changes.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-[300px]">
      <div className="flex flex-col gap-1 pr-3">
        {events.map((event) => {
          const config = typeConfig[event.type] || {
            icon: RefreshCw,
            color: "text-muted-foreground",
            bg: "bg-muted",
          }
          const Icon = config.icon

          return (
            <div
              key={event.id}
              className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${config.bg} transition-colors`}
            >
              <div
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded ${config.color}`}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed text-foreground">
                  {event.description}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {formatRelativeTime(event.timestamp)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
