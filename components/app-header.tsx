"use client"

import { useRouter } from "next/navigation"
import { Network, LogOut, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PollingState } from "@/lib/ospf-types"
import { LiveIndicator } from "@/components/live-indicator"

interface AppHeaderProps {
  pollingState: PollingState
  user: { name: string; email: string } | null
}

export function AppHeader({ pollingState, user }: AppHeaderProps) {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Network className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight">
            OSPF Topology Visualizer
          </h1>
        </div>
        <div className="h-4 w-px bg-border" />
        <LiveIndicator pollingState={pollingState} />
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="hidden sm:flex flex-col">
                <span className="text-xs font-medium text-foreground leading-none">{user.name}</span>
                <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{user.email}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-7 gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
