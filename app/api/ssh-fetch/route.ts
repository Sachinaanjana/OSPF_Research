import { NextResponse } from "next/server"
import { Socket } from "net"

// The 6 OSPF commands we need, mapped to MultiCommandInput keys
const OSPF_COMMANDS: Array<{ key: string; cmd: string }> = [
  { key: "showIpOspf", cmd: "show ip ospf" },
  { key: "showIpOspfNeighbor", cmd: "show ip ospf neighbor" },
  { key: "showIpOspfDatabaseRouter", cmd: "show ip ospf database router" },
  { key: "showIpOspfDatabaseNetwork", cmd: "show ip ospf database network" },
  { key: "showIpOspfInterface", cmd: "show ip ospf interface" },
  { key: "showIpRouteOspf", cmd: "show ip route ospf" },
]

const TELNET_TIMEOUT = 60000 // 60 seconds total
const COMMAND_DELAY = 300 // ms between commands
const PROMPT_WAIT = 1500 // ms to wait for prompt after command

/**
 * Execute Telnet commands to a Cisco IOS device.
 * Telnet uses raw TCP on port 23 — no encryption algorithm negotiation required.
 */
function execTelnet(
  host: string,
  port: number,
  username: string,
  password: string,
  enablePassword: string | undefined,
  commands: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let output = ""
    let finished = false
    let commandIndex = -1 // -1 = login phase, 0+ = command execution
    let inEnableMode = false
    let enableAttempted = false

    // Queue of commands to send: terminal length 0, then user commands, then exit
    const cmdQueue = ["terminal length 0", ...commands, "exit"]

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        socket.destroy()
        reject(new Error(`Telnet connection timed out after ${TELNET_TIMEOUT / 1000}s`))
      }
    }, TELNET_TIMEOUT)

    const cleanup = () => {
      clearTimeout(timer)
      if (!socket.destroyed) socket.destroy()
    }

    const sendCommand = (cmd: string) => {
      socket.write(cmd + "\r\n")
    }

    const processNextCommand = () => {
      commandIndex++
      if (commandIndex < cmdQueue.length) {
        setTimeout(() => {
          if (!finished) {
            sendCommand(cmdQueue[commandIndex])
          }
        }, COMMAND_DELAY)
      } else {
        // All commands sent, wait for final output then close
        setTimeout(() => {
          if (!finished) {
            finished = true
            cleanup()
            resolve(output)
          }
        }, PROMPT_WAIT)
      }
    }

    socket.on("connect", () => {
      // Connected, wait for login prompt
    })

    socket.on("data", (data: Buffer) => {
      const chunk = data.toString()
      output += chunk

      // Strip Telnet IAC sequences for prompt detection
      const cleanChunk = chunk.replace(/\xff[\xfb\xfc\xfd\xfe].|\xff\xfa[\s\S]*?\xff\xf0/g, "")
      const cleanOutput = output.replace(/\xff[\xfb\xfc\xfd\xfe].|\xff\xfa[\s\S]*?\xff\xf0/g, "")

      // Login phase
      if (commandIndex === -1) {
        // Username prompt
        if (/[Uu]sername[:\s]*$/.test(cleanOutput) || /[Ll]ogin[:\s]*$/.test(cleanOutput)) {
          sendCommand(username)
          return
        }
        // Password prompt (during login)
        if (/[Pp]assword[:\s]*$/.test(cleanOutput) && !inEnableMode) {
          sendCommand(password)
          return
        }
        // Privileged EXEC prompt (Router#) — ready to send commands
        if (/[\w\-\.]+#\s*$/.test(cleanOutput)) {
          inEnableMode = true
          processNextCommand()
          return
        }
        // User EXEC prompt (Router>) — need to enter enable mode
        if (/[\w\-\.]+>\s*$/.test(cleanOutput)) {
          if (!enableAttempted) {
            enableAttempted = true
            sendCommand("enable")
            return
          }
        }
        // Enable password prompt
        if (/[Pp]assword[:\s]*$/.test(cleanOutput) && enableAttempted && !inEnableMode) {
          sendCommand(enablePassword || password)
          return
        }
        // Authentication failed
        if (/[Aa]uthentication\s+[Ff]ailed|[Bb]ad\s+[Pp]assword|[Ll]ogin\s+[Ii]nvalid|[Aa]ccess\s+[Dd]enied/i.test(cleanOutput)) {
          finished = true
          cleanup()
          reject(new Error("Authentication failed: Invalid username or password"))
          return
        }
      }

      // Command execution phase — detect prompt to send next command
      if (commandIndex >= 0 && commandIndex < cmdQueue.length) {
        // Check if we see a privileged prompt after the current command
        if (/[\w\-\.]+#\s*$/.test(cleanChunk)) {
          processNextCommand()
        }
      }
    })

    socket.on("error", (err) => {
      if (finished) return
      finished = true
      cleanup()
      
      if (err.message.includes("ECONNREFUSED")) {
        reject(new Error("Connection refused: Telnet port may be blocked or not enabled on the router"))
      } else if (err.message.includes("ETIMEDOUT") || err.message.includes("EHOSTUNREACH")) {
        reject(new Error("Connection timed out: Router is unreachable"))
      } else {
        reject(new Error(`Telnet error: ${err.message}`))
      }
    })

    socket.on("close", () => {
      if (finished) return
      finished = true
      cleanup()
      resolve(output)
    })

    socket.on("timeout", () => {
      if (finished) return
      finished = true
      cleanup()
      reject(new Error("Telnet socket timeout"))
    })

    // Set socket timeout
    socket.setTimeout(TELNET_TIMEOUT)

    // Connect
    socket.connect(port, host)
  })
}

/**
 * Parse raw Telnet output into per-command results.
 */
function parseCommandOutput(
  raw: string,
  commands: Array<{ key: string; cmd: string }>
): Record<string, string> {
  const results: Record<string, string> = {}

  // Clean up Telnet control sequences
  const cleaned = raw
    .replace(/\xff[\xfb\xfc\xfd\xfe].|\xff\xfa[\s\S]*?\xff\xf0/g, "") // IAC sequences
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

  for (let i = 0; i < commands.length; i++) {
    const { key, cmd } = commands[i]
    const nextCmd = commands[i + 1]?.cmd

    // Find this command in the output
    const cmdIndex = cleaned.indexOf(cmd)
    if (cmdIndex === -1) {
      results[key] = ""
      continue
    }

    // Find where the output for this command starts (after the command line)
    const lineEnd = cleaned.indexOf("\n", cmdIndex)
    const startIndex = lineEnd !== -1 ? lineEnd + 1 : cmdIndex + cmd.length

    // Find where the next command or prompt starts
    let endIndex = cleaned.length
    if (nextCmd) {
      const nextIndex = cleaned.indexOf(nextCmd, startIndex)
      if (nextIndex !== -1) {
        // Go back to the prompt line before the next command
        const promptLineStart = cleaned.lastIndexOf("\n", nextIndex - 1)
        if (promptLineStart !== -1 && promptLineStart > startIndex) {
          endIndex = promptLineStart
        } else {
          endIndex = nextIndex
        }
      }
    }

    // Also look for the router prompt at the end
    const outputSlice = cleaned.slice(startIndex, endIndex)
    const promptMatch = outputSlice.match(/\n[\w\-\.]+#\s*$/m)
    if (promptMatch && promptMatch.index !== undefined) {
      endIndex = startIndex + promptMatch.index
    }

    // Extract and clean the output
    let cmdOutput = cleaned.slice(startIndex, endIndex).trim()
    
    // Remove any trailing prompts
    cmdOutput = cmdOutput.replace(/\n[\w\-\.]+#\s*$/, "").trim()

    results[key] = cmdOutput
  }

  return results
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      host,
      port = 23, // Default Telnet port
      username,
      password,
      enablePassword,
      command,
    } = body as {
      host: string
      port?: number
      username: string
      password: string
      enablePassword?: string
      command?: string
    }

    // Validate
    if (!host || !username || !password) {
      return NextResponse.json(
        { error: "Missing required fields: host, username, password" },
        { status: 400 }
      )
    }

    // Sanitize host — only allow IP/hostname
    const hostClean = host.trim()
    if (!/^[\w.\-:]+$/.test(hostClean)) {
      return NextResponse.json({ error: "Invalid host format" }, { status: 400 })
    }

    const portNum = Math.min(65535, Math.max(1, Number(port) || 23))

    // Determine which commands to run
    const commandsToRun = command
      ? [{ key: "raw", cmd: command.trim() }]
      : OSPF_COMMANDS

    // Execute Telnet
    const rawOutput = await execTelnet(
      hostClean,
      portNum,
      username.trim(),
      password,
      enablePassword,
      commandsToRun.map((c) => c.cmd)
    )

    // Parse the output into per-command results
    const commandResults = command
      ? { raw: rawOutput }
      : parseCommandOutput(rawOutput, OSPF_COMMANDS)

    // Check if we got any meaningful output
    const hasOutput = Object.values(commandResults).some((v) => v && v.trim().length > 0)
    if (!hasOutput) {
      return NextResponse.json(
        { error: "No output received from router. Check if OSPF is configured and Telnet is enabled." },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: JSON.stringify(commandResults),
      host: hostClean,
      timestamp: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Telnet error"
    console.error("[v0] Telnet error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
