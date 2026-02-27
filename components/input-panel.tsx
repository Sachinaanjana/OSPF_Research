"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Play,
  FileText,
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
} from "lucide-react"

// ---- Types ----

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
  value: string
  onChange: (value: string) => void
  onParse: () => void
  onClear: () => void
  onSSHData?: (data: string, host: string) => void
  isParsing: boolean
  parseError: string | null
}

// ---- Helpers ----

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

// ---- Component ----

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

  // SSH state
  const [sshHost, setSSHHost] = useState("")
  const [sshPort, setSSHPort] = useState("22")
  const [sshUser, setSSHUser] = useState("")
  const [sshPass, setSSHPass] = useState("")
  const [sshEnable, setSSHEnable] = useState("")
  const [sshCommand, setSSHCommand] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [sshStatus, setSSHStatus] = useState<SSHStatus>({
    state: "idle",
    message: "",
  })

  // Saved profiles
  const [profiles, setProfiles] = useState<SavedProfile[]>([])
  const [showProfiles, setShowProfiles] = useState(false)
  const [profileName, setProfileName] = useState("")

  // Load profiles on mount
  useEffect(() => {
    setProfiles(loadProfiles())
  }, [])

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      onChange(text)
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // SSH connect and fetch
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
        setSSHStatus({
          state: "error",
          message: data.error || "SSH connection failed",
        })
        return
      }

      setSSHStatus({
        state: "success",
        message: `Data received from ${sshHost}`,
        lastConnected: Date.now(),
      })

      // Push data to parent
      if (onSSHData) {
        onSSHData(data.data, sshHost)
      } else {
        onChange(data.data)
      }
    } catch (err) {
      setSSHStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      })
    }
  }, [sshHost, sshPort, sshUser, sshPass, sshCommand, sshEnable, onChange, onSSHData])

  // Save profile
  const handleSaveProfile = useCallback(() => {
    const name = profileName.trim() || `${sshHost}:${sshPort}`
    const newProfile: SavedProfile = {
      id: Date.now().toString(36),
      name,
      host: sshHost,
      port: parseInt(sshPort) || 22,
      username: sshUser,
      command: sshCommand,
    }
    const updated = [...profiles, newProfile]
    setProfiles(updated)
    saveProfiles(updated)
    setProfileName("")
  }, [profileName, sshHost, sshPort, sshUser, sshCommand, profiles])

  // Load profile
  const handleLoadProfile = useCallback(
    (profile: SavedProfile) => {
      setSSHHost(profile.host)
      setSSHPort(String(profile.port))
      setSSHUser(profile.username)
      setSSHCommand(profile.command)
      setShowProfiles(false)
    },
    []
  )

  // Delete profile
  const handleDeleteProfile = useCallback(
    (id: string) => {
      const updated = profiles.filter((p) => p.id !== id)
      setProfiles(updated)
      saveProfiles(updated)
    },
    [profiles]
  )

  const isSSHBusy = sshStatus.state === "connecting" || sshStatus.state === "fetching"
  const canConnect = sshHost.trim() && sshUser.trim() && sshPass.trim() && !isSSHBusy

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="paste" className="flex flex-col h-full">
        <div className="px-4 pt-3 pb-1">
          <TabsList className="w-full grid grid-cols-2 h-9 bg-secondary/50">
            <TabsTrigger
              value="paste"
              className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-foreground"
            >
              <FileText className="w-3.5 h-3.5" />
              Paste Data
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

        {/* ---- Paste Tab ---- */}
        <TabsContent value="paste" className="flex-1 flex flex-col px-4 pb-4 gap-3 mt-0 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              OSPF LSA Data
            </h2>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Upload
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
                onClick={onClear}
                disabled={!value}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.log"
            onChange={handleFileUpload}
            className="hidden"
            aria-label="Upload OSPF data file"
          />

          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={'Paste "show ip ospf database" output here...\n\nOr upload a .txt/.log file.'}
            className="flex-1 resize-none font-mono text-xs bg-secondary/30 border-border placeholder:text-muted-foreground/40 min-h-[200px]"
          />

          {parseError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-xs text-destructive">{parseError}</p>
            </div>
          )}

          <Button
            onClick={onParse}
            disabled={!value || isParsing}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
            size="sm"
          >
            <Play className="w-3.5 h-3.5" />
            {isParsing ? "Parsing..." : "Parse & Visualize"}
          </Button>
        </TabsContent>

        {/* ---- SSH Tab ---- */}
        <TabsContent value="ssh" className="flex-1 flex flex-col mt-0 overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="flex flex-col px-4 pb-4 gap-3">
              {/* Status bar */}
              <div
                className="flex items-center gap-2 rounded-md px-3 py-2 text-xs"
                style={{
                  backgroundColor:
                    sshStatus.state === "success"
                      ? "hsl(160 70% 48% / 0.1)"
                      : sshStatus.state === "error"
                        ? "hsl(0 72% 51% / 0.1)"
                        : isSSHBusy
                          ? "hsl(200 80% 55% / 0.1)"
                          : "hsl(220 16% 14%)",
                  borderLeft:
                    sshStatus.state === "success"
                      ? "3px solid hsl(160 70% 48%)"
                      : sshStatus.state === "error"
                        ? "3px solid hsl(0 72% 51%)"
                        : isSSHBusy
                          ? "3px solid hsl(200 80% 55%)"
                          : "3px solid hsl(220 14% 25%)",
                }}
              >
                {sshStatus.state === "idle" && (
                  <WifiOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                )}
                {isSSHBusy && (
                  <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />
                )}
                {sshStatus.state === "success" && (
                  <Wifi className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                )}
                {sshStatus.state === "error" && (
                  <WifiOff className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                )}
                <span
                  className={
                    sshStatus.state === "error"
                      ? "text-destructive"
                      : sshStatus.state === "success"
                        ? "text-primary"
                        : "text-muted-foreground"
                  }
                >
                  {sshStatus.state === "idle"
                    ? "Not connected"
                    : sshStatus.message}
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
                    {showProfiles ? (
                      <ChevronUp className="w-3 h-3 ml-auto" />
                    ) : (
                      <ChevronDown className="w-3 h-3 ml-auto" />
                    )}
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
                            <p className="text-xs font-medium text-foreground truncate">
                              {p.name}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {p.username}@{p.host}:{p.port}
                            </p>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteProfile(p.id)
                            }}
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
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Router Credentials
                </h3>

                <div className="grid grid-cols-[1fr_70px] gap-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Host / IP Address
                    </Label>
                    <Input
                      value={sshHost}
                      onChange={(e) => setSSHHost(e.target.value)}
                      placeholder="192.168.1.1"
                      className="h-8 text-xs font-mono bg-secondary/30 border-border"
                      disabled={isSSHBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Port
                    </Label>
                    <Input
                      value={sshPort}
                      onChange={(e) => setSSHPort(e.target.value)}
                      placeholder="22"
                      className="h-8 text-xs font-mono bg-secondary/30 border-border"
                      disabled={isSSHBusy}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Username
                  </Label>
                  <Input
                    value={sshUser}
                    onChange={(e) => setSSHUser(e.target.value)}
                    placeholder="admin"
                    className="h-8 text-xs font-mono bg-secondary/30 border-border"
                    disabled={isSSHBusy}
                    autoComplete="username"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      value={sshPass}
                      onChange={(e) => setSSHPass(e.target.value)}
                      type={showPassword ? "text" : "password"}
                      placeholder="********"
                      className="h-8 text-xs font-mono bg-secondary/30 border-border pr-8"
                      disabled={isSSHBusy}
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Enable Password{" "}
                    <span className="text-muted-foreground/50">(optional)</span>
                  </Label>
                  <Input
                    value={sshEnable}
                    onChange={(e) => setSSHEnable(e.target.value)}
                    type="password"
                    placeholder="Enable secret"
                    className="h-8 text-xs font-mono bg-secondary/30 border-border"
                    disabled={isSSHBusy}
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Advanced */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Command
                </h3>
                <Input
                  value={sshCommand}
                  onChange={(e) => setSSHCommand(e.target.value)}
                  placeholder="show ip ospf database (default)"
                  className="h-8 text-xs font-mono bg-secondary/30 border-border"
                  disabled={isSSHBusy}
                />
                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                  Leave empty to run default OSPF commands. Or enter a custom
                  command like{" "}
                  <code className="text-muted-foreground bg-secondary/50 px-1 rounded">
                    show ip ospf database router
                  </code>
                </p>
              </div>

              {/* Connect + Save buttons */}
              <div className="flex flex-col gap-2 mt-1">
                <Button
                  onClick={handleSSHFetch}
                  disabled={!canConnect}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                  size="sm"
                >
                  {isSSHBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Terminal className="w-3.5 h-3.5" />
                  )}
                  {sshStatus.state === "connecting"
                    ? "Connecting..."
                    : sshStatus.state === "fetching"
                      ? "Fetching OSPF Data..."
                      : "Connect & Fetch"}
                </Button>

                {sshHost && sshUser && (
                  <div className="flex items-center gap-2">
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder={`${sshHost} (profile name)`}
                      className="h-7 text-xs bg-secondary/30 border-border flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-border text-muted-foreground hover:text-foreground"
                      onClick={handleSaveProfile}
                    >
                      <Save className="w-3 h-3" />
                      Save
                    </Button>
                  </div>
                )}
              </div>

              {/* SSH error message */}
              {sshStatus.state === "error" && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                  <p className="text-xs text-destructive">{sshStatus.message}</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
