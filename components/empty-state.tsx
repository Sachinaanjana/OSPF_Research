"use client"

import { Network, Upload, Terminal } from "lucide-react"

export function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="flex flex-col items-center gap-6 max-w-md text-center px-6">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/5 border border-primary/10">
          <Network className="w-8 h-8 text-primary/50" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-foreground">
            No Topology Data
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Paste OSPF LSA output from your network devices to generate an
            interactive topology map. Supported commands:
          </p>
        </div>

        <div className="w-full flex flex-col gap-2.5">
          <div className="flex items-start gap-3 rounded-lg bg-secondary/30 border border-border px-4 py-3 text-left">
            <Terminal className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">Cisco IOS / IOS-XE</p>
              <code className="text-[11px] font-mono text-muted-foreground">
                show ip ospf database
              </code>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-secondary/30 border border-border px-4 py-3 text-left">
            <Upload className="w-4 h-4 text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">API Push Mode</p>
              <code className="text-[11px] font-mono text-muted-foreground">
                {"POST /api/ospf-poll with raw text body"}
              </code>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Paste your data in the Input panel on the left, then click
          &ldquo;Parse & Visualize&rdquo;
        </p>
      </div>
    </div>
  )
}
