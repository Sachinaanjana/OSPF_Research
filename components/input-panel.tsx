"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MultiCommandInput } from "@/lib/ospf-parser"
import {
  Play,
  Upload,
  Trash2,
  Terminal,
  Wifi,
  WifiOff,
  Loader2,
  Clock,
  Save,
  ChevronDown,
  ChevronUp,
  Server,
  Eye,
  EyeOff,
  Database,
  ChevronRight,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────

interface SavedProfile {
  id: string
  name: string
  host: string
  port: number
  username: string
  command: string
}

interface SSHStatus {
  state: "idle" | "connecting" | "fetching" | "success" | "error"
  message: string
  lastConnected?: number
}

interface InputPanelProps {
  value: MultiCommandInput
  onChange: (value: MultiCommandInput) => void
  onParse: () => void
  onClear: () => void
  onSSHData?: (data: string, host: string) => void
  isParsing: boolean
  parseError: string | null
}

const PROFILES_KEY = "ospf-ssh-profiles"

function loadProfiles(): SavedProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function saveProfiles(profiles: SavedProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

// ── Command field definitions ──────────────────────────────

const COMMAND_FIELDS: Array<{
  key: keyof MultiCommandInput
  label: string
  command: string
  placeholder: string
  rows?: number
}> = [
  {
    key: "showIpOspf",
    label: "show ip ospf",
    command: "show ip ospf",
    placeholder: "Paste output of: show ip ospf\n\nShows process ID, Router ID, number of areas, SPF statistics...",
    rows: 4,
  },
  {
    key: "showIpOspfNeighbor",
    label: "show ip ospf neighbor",
    command: "show ip ospf neighbor",
    placeholder: "Paste output of: show ip ospf neighbor\n\nNeighbor ID   Pri   State   Dead Time   Address   Interface",
    rows: 5,
  },
  {
    key: "showIpOspfDatabaseRouter",
    label: "show ip ospf database router",
    command: "show ip ospf database router",
    placeholder: "Paste output of: show ip ospf database router\n\nRouter LSAs (Type 1) — required for topology.",
    rows: 8,
  },
  {
    key: "showIpOspfDatabaseNetwork",
    label: "show ip ospf database network",
    command: "show ip ospf database network",
    placeholder: "Paste output of: show ip ospf database network\n\nNetwork LSAs (Type 2) — transit networks.",
    rows: 6,
  },
  {
    key: "showIpOspfInterface",
    label: "show ip ospf interface",
    command: "show ip ospf interface",
    placeholder: "Paste output of: show ip ospf interface\n\nInterface state, cost, DR/BDR, hello/dead timers...",
    rows: 5,
  },
  {
    key: "showIpRouteOspf",
    label: "show ip route ospf",
    command: "show ip route ospf",
    placeholder: "Paste output of: show ip route ospf\n\nO  10.0.0.0/24 [110/20] via 192.168.1.1, Gi0/0",
    rows: 5,
  },
]

// ── Section component ──────────────────────────────────────

function CommandSection({
  field,
  value,
  onChange,
  onFileUpload,
}: {
  field: (typeof COMMAND_FIELDS)[number]
  value: string
  onChange: (val: string) => void
  onFileUpload: (key: keyof MultiCommandInput) => void
}) {
  const [open, setOpen] = useState(field.key === "showIpOspfDatabaseRouter")
  const filled = value.trim().length > 0

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${filled ? "bg-primary" : "bg-muted-foreground/30"}`}
          />
          <code className="text-xs font-mono font-semibold text-foreground">
            {field.command}
          </code>
          {filled && (
            <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded font-medium">
              filled
            </span>
          )}
        </div>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="p-2.5 flex flex-col gap-2 bg-card">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => onFileUpload(field.key)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors"
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={field.rows ?? 5}
            className="resize-y font-mono text-xs bg-secondary/20 border-border placeholder:text-muted-foreground/35 leading-relaxed"
          />
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export function InputPanel({
  value,
  onChange,
  onParse,
  onClear,
  onSSHData,
  isParsing,
  parseError,
}: InputPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileTargetKey, setFileTargetKey] = useState<keyof MultiCommandInput>("showIpOspfDatabaseRouter")

  // SSH state
  const [sshHost, setSSHHost] = useState("")
  const [sshPort, setSSHPort] = useState("22")
  const [sshUser, setSSHUser] = useState("")
  const [sshPass, setSSHPass] = useState("")
  const [sshEnable, setSSHEnable] = useState("")
  const [sshCommand, setSSHCommand] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [sshStatus, setSSHStatus] = useState<SSHStatus>({ state: "idle", message: "" })
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [showProfiles, setShowProfiles] = useState(false)
  const [profileName, setProfileName] = useState("")

  useEffect(() => {
    setProfiles(loadProfiles())
  }, [])

  // File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      onChange({ ...value, [fileTargetKey]: text })
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [value, onChange, fileTargetKey])

  const triggerFileUpload = useCallback((key: keyof MultiCommandInput) => {
    setFileTargetKey(key)
    // Small delay so state updates before click
    setTimeout(() => fileInputRef.current?.click(), 0)
  }, [])

  const hasAnyInput = Object.values(value).some(v => v?.trim())

  // SSH fetch
  const handleSSHFetch = useCallback(async () => {
    if (!sshHost || !sshUser || !sshPass) return
    setSSHStatus({ state: "connecting", message: `Connecting to ${sshHost}...` })

    try {
      const res = await fetch("/api/ssh-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: sshHost.trim(),
          port: parseInt(sshPort) || 22,
          username: sshUser.trim(),
          password: sshPass,
          command: sshCommand.trim() || undefined,
          enablePassword: sshEnable || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setSSHStatus({ state: "error", message: data.error || "SSH connection failed" })
        return
      }
      setSSHStatus({ state: "success", message: `Data received from ${sshHost}`, lastConnected: Date.now() })
      if (onSSHData) onSSHData(data.data, sshHost)
      else onChange({ ...value, raw: data.data })
    } catch (err) {
      setSSHStatus({ state: "error", message: err instanceof Error ? err.message : "Connection failed" })
    }
  }, [sshHost, sshPort, sshUser, sshPass, sshCommand, sshEnable, value, onChange, onSSHData])

  const handleSaveProfile = useCallback(() => {
    const name = profileName.trim() || `${sshHost}:${sshPort}`
    const newProfile: SavedProfile = {
      id: Date.now().toString(36), name,
      host: sshHost, port: parseInt(sshPort) || 22,
      username: sshUser, command: sshCommand,
    }
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    saveProfiles(updated)
    setProfileName("")
  }, [profileName, sshHost, sshPort, sshUser, sshCommand, profiles])

  const handleLoadProfile = useCallback((profile: SavedProfile) => {
    setSSHHost(profile.host)
    setSSHPort(String(profile.port))
    setSSHUser(profile.username)
    setSSHCommand(profile.command)
    setShowProfiles(false)
  }, [])

  const handleDeleteProfile = useCallback((id: string) => {
    const updated = profiles.filter((p) => p.id !== id)
    setProfiles(updated)
    saveProfiles(updated)
  }, [profiles])

  const isSSHBusy = sshStatus.state === "connecting" || sshStatus.state === "fetching"
  const canConnect = sshHost.trim() && sshUser.trim() && sshPass.trim() && !isSSHBusy

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="commands" className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-1">
          <TabsList className="w-full grid grid-cols-2 h-9 bg-secondary/50">
            <TabsTrigger
              value="commands"
              className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground"
            >
              <Database className="w-3.5 h-3.5" />
              Commands
            </TabsTrigger>
            <TabsTrigger
              value="ssh"
              className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground"
            >
              <Terminal className="w-3.5 h-3.5" />
              SSH Connect
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Commands Tab ── */}
        <TabsContent value="commands" className="flex-1 flex flex-col mt-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="flex flex-col px-4 pb-4 gap-3">
              <div className="flex items-center justify-between pt-1">
                <div>
                  <h2 className="text-xs font-semibold text-foreground">OSPF Command Outputs</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Paste output from each command below. At minimum, provide the database router output.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClear}
                  disabled={!hasAnyInput}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-30 px-2 py-1 rounded-sm hover:bg-secondary/50 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear all
                </button>
              </div>

              {/* Status: filled fields count */}
              {hasAnyInput && (
                <div className="flex items-center gap-1.5 text-[10px] text-primary bg-primary/10 rounded-md px-2.5 py-1.5 border border-primary/20">
                  <span className="font-semibold">
                    {Object.values(value).filter(v => v?.trim()).length} of {COMMAND_FIELDS.length}
                  </span>
                  <span className="text-muted-foreground">command outputs provided</span>
                </div>
              )}

              {/* Six command fields */}
              {COMMAND_FIELDS.map((field) => (
                <CommandSection
                  key={field.key}
                  field={field}
                  value={value[field.key] ?? ""}
                  onChange={(v) => onChange({ ...value, [field.key]: v })}
                  onFileUpload={triggerFileUpload}
                />
              ))}

              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.log"
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Upload command output file"
              />

              {parseError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <p className="text-xs text-destructive">{parseError}</p>
                </div>
              )}

              <Button
                onClick={onParse}
                disabled={!hasAnyInput || isParsing}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                size="sm"
              >
                <Play className="w-3.5 h-3.5" />
                {isParsing ? "Parsing..." : "Parse & Visualize"}
              </Button>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ── SSH Tab ── */}
        <TabsContent value="ssh" className="flex-1 flex flex-col mt-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="flex flex-col px-4 pb-4 gap-3">
              {/* Status bar */}
              <div
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                style={{
                  backgroundColor:
                    sshStatus.state === "success" ? "hsl(160 70% 48% / 0.1)"
                    : sshStatus.state === "error" ? "hsl(0 72% 51% / 0.1)"
                    : isSSHBusy ? "hsl(200 80% 55% / 0.1)"
                    : "hsl(220 16% 14%)",
                  borderLeft:
                    sshStatus.state === "success" ? "3px solid hsl(160 70% 48%)"
                    : sshStatus.state === "error" ? "3px solid hsl(0 72% 51%)"
                    : isSSHBusy ? "3px solid hsl(200 80% 55%)"
                    : "3px solid hsl(220 14% 25%)",
                }}
              >
                {sshStatus.state === "idle" && <WifiOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                {isSSHBusy && <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />}
                {sshStatus.state === "success" && <Wifi className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                {sshStatus.state === "error" && <WifiOff className="w-3.5 h-3.5 text-destructive flex-shrink-0" />}
                <span className={sshStatus.state === "error" ? "text-destructive" : sshStatus.state === "success" ? "text-primary" : "text-muted-foreground"}>
                  {sshStatus.state === "idle" ? "Not connected" : sshStatus.message}
                </span>
                {sshStatus.lastConnected && (
                  <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(sshStatus.lastConnected).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Saved Profiles */}
              {profiles.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowProfiles(!showProfiles)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                  >
                    <Server className="w-3 h-3" />
                    Saved Devices ({profiles.length})
                    {showProfiles ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
                  </button>
                  {showProfiles && (
                    <div className="mt-2 flex flex-col gap-1">
                      {profiles.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 rounded-md bg-secondary/30 border border-border px-2.5 py-1.5 hover:bg-secondary/50 transition-colors group cursor-pointer"
                          onClick={() => handleLoadProfile(p)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === "Enter" && handleLoadProfile(p)}
                        >
                          <Server className="w-3 h-3 text-primary flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{p.username}@{p.host}:{p.port}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            aria-label={`Delete profile ${p.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Connection Form */}
              <div className="flex flex-col gap-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Router Credentials</h3>
                <div className="grid grid-cols-[1fr_70px] gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground">Host / IP Address</Label>
                    <Input value={sshHost} onChange={(e) => setSSHHost(e.target.value)} placeholder="192.168.1.1" className="h-8 text-xs font-mono bg-secondary/30 border-border" disabled={isSSHBusy} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground">Port</Label>
                    <Input value={sshPort} onChange={(e) => setSSHPort(e.target.value)} placeholder="22" className="h-8 text-xs font-mono bg-secondary/30 border-border" disabled={isSSHBusy} />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">Username</Label>
                  <Input value={sshUser} onChange={(e) => setSSHUser(e.target.value)} placeholder="admin" className="h-8 text-xs font-mono bg-secondary/30 border-border" disabled={isSSHBusy} autoComplete="username" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">Password</Label>
                  <div className="relative">
                    <Input value={sshPass} onChange={(e) => setSSHPass(e.target.value)} type={showPassword ? "text" : "password"} placeholder="********" className="h-8 text-xs font-mono bg-secondary/30 border-border pr-8" disabled={isSSHBusy} autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">Enable Password <span className="text-muted-foreground/50">(optional)</span></Label>
                  <Input value={sshEnable} onChange={(e) => setSSHEnable(e.target.value)} type="password" placeholder="Enable secret" className="h-8 text-xs font-mono bg-secondary/30 border-border" disabled={isSSHBusy} autoComplete="off" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Command</h3>
                <Input value={sshCommand} onChange={(e) => setSSHCommand(e.target.value)} placeholder="show ip ospf database (default)" className="h-8 text-xs font-mono bg-secondary/30 border-border" disabled={isSSHBusy} />
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Leave empty to run default OSPF commands, or enter a custom command.
                </p>
              </div>

              <div className="flex flex-col gap-2 mt-1">
                <Button onClick={handleSSHFetch} disabled={!canConnect} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2" size="sm">
                  {isSSHBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
                  {sshStatus.state === "connecting" ? "Connecting..." : sshStatus.state === "fetching" ? "Fetching OSPF Data..." : "Connect & Fetch"}
                </Button>

                {sshHost && sshUser && (
                  <div className="flex items-center gap-2">
                    <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder={`${sshHost} (profile name)`} className="h-7 text-xs bg-secondary/30 border-border flex-1" />
                    <Button variant="outline" size="sm" onClick={handleSaveProfile} className="h-7 text-xs gap-1 shrink-0">
                      <Save className="w-3 h-3" />
                      Save
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
