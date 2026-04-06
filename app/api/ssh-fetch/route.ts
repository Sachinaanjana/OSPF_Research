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

const TELNET_TIMEOUT = 90000 // 90 seconds total (OSPF database can be large)
const COMMAND_DELAY = 500 // ms between commands
const PROMPT_WAIT = 2000 // ms to wait for prompt after command
const DATA_SETTLE_TIME = 1000 // ms to wait after last data chunk before considering output complete

/**
 * Execute Telnet commands to a Cisco IOS/IOS-XE device.
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
    let usernameEntered = false
    let passwordEntered = false
    let lastDataTime = Date.now()
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    // Queue of commands to send: terminal length 0, then user commands
    const cmdQueue = ["terminal length 0", "terminal width 512", ...commands]

    const log = (msg: string) => {
      console.log(`[v0] Telnet ${host}: ${msg}`)
    }

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        log(`Timeout after ${TELNET_TIMEOUT / 1000}s. Output so far: ${output.length} bytes`)
        socket.destroy()
        // Return partial output instead of failing
        if (output.length > 100) {
          resolve(output)
        } else {
          reject(new Error(`Telnet connection timed out after ${TELNET_TIMEOUT / 1000}s`))
        }
      }
    }, TELNET_TIMEOUT)

    const cleanup = () => {
      clearTimeout(timer)
      if (settleTimer) clearTimeout(settleTimer)
      if (!socket.destroyed) socket.destroy()
    }

    const sendCommand = (cmd: string) => {
      log(`Sending: ${cmd.substring(0, 50)}${cmd.length > 50 ? "..." : ""}`)
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
        // All commands sent, wait for final output then close gracefully
        log("All commands sent, waiting for final output...")
        setTimeout(() => {
          if (!finished) {
            finished = true
            sendCommand("exit")
            setTimeout(() => {
              cleanup()
              resolve(output)
            }, 500)
          }
        }, PROMPT_WAIT)
      }
    }

    // Clean Telnet IAC sequences from text
    const cleanTelnet = (text: string) => {
      return text
        .replace(/\xff[\xfb\xfc\xfd\xfe]./g, "") // IAC WILL/WONT/DO/DONT
        .replace(/\xff\xfa[\s\S]*?\xff\xf0/g, "") // IAC SB...SE subnegotiation
        .replace(/\xff\xff/g, "\xff") // Escaped 0xFF
    }

    // Cisco prompt patterns (handles hostnames with brackets like NMC-ASR1001HX[0.110])
    const PRIV_PROMPT = /[\w\-\.\[\]]+#\s*$/
    const USER_PROMPT = /[\w\-\.\[\]]+>\s*$/
    const USERNAME_PROMPT = /[Uu]sername:\s*$|[Ll]ogin:\s*$/
    const PASSWORD_PROMPT = /[Pp]assword:\s*$/

    socket.on("connect", () => {
      log("TCP connected, waiting for banner/prompt...")
    })

    socket.on("data", (data: Buffer) => {
      const chunk = data.toString()
      output += chunk
      lastDataTime = Date.now()

      // Reset settle timer on each data chunk
      if (settleTimer) clearTimeout(settleTimer)

      const cleanChunk = cleanTelnet(chunk)
      const cleanOutput = cleanTelnet(output)
      const last500 = cleanOutput.slice(-500) // Only check last 500 chars for prompts

      // Login phase
      if (commandIndex === -1) {
        // Username prompt
        if (USERNAME_PROMPT.test(last500) && !usernameEntered) {
          usernameEntered = true
          log("Username prompt detected")
          sendCommand(username)
          return
        }

        // Password prompt (during login, before enable mode)
        if (PASSWORD_PROMPT.test(last500) && !passwordEntered && !enableAttempted) {
          passwordEntered = true
          log("Password prompt detected")
          sendCommand(password)
          return
        }

        // Privileged EXEC prompt (Router#) — already in enable mode
        if (PRIV_PROMPT.test(last500)) {
          if (!inEnableMode) {
            inEnableMode = true
            log("Privileged EXEC prompt detected, starting commands...")
            processNextCommand()
          }
          return
        }

        // User EXEC prompt (Router>) — need to enter enable mode
        if (USER_PROMPT.test(last500) && !enableAttempted) {
          enableAttempted = true
          log("User EXEC prompt detected, entering enable mode...")
          sendCommand("enable")
          return
        }

        // Enable password prompt
        if (PASSWORD_PROMPT.test(last500) && enableAttempted && !inEnableMode) {
          log("Enable password prompt detected")
          sendCommand(enablePassword || password)
          return
        }

        // Authentication failed
        if (/[Aa]uthentication\s*[Ff]ailed|[Bb]ad\s*[Pp]assword|[Ll]ogin\s*[Ii]nvalid|[Aa]ccess\s*[Dd]enied|% [Aa]ccess denied/i.test(cleanOutput)) {
          finished = true
          cleanup()
          log("Authentication failed")
          reject(new Error("Authentication failed: Invalid username or password"))
          return
        }
      }

      // Command execution phase — detect prompt to send next command
      if (commandIndex >= 0 && commandIndex < cmdQueue.length) {
        // Use settle timer: wait for data to stop flowing, then check for prompt
        settleTimer = setTimeout(() => {
          const latestClean = cleanTelnet(output).slice(-500)
          if (PRIV_PROMPT.test(latestClean)) {
            log(`Command ${commandIndex + 1}/${cmdQueue.length} complete`)
            processNextCommand()
          }
        }, DATA_SETTLE_TIME)
      }
    })

    socket.on("error", (err) => {
      if (finished) return
      finished = true
      cleanup()

      log(`Socket error: ${err.message}`)
      
      if (err.message.includes("ECONNREFUSED")) {
        reject(new Error("Connection refused: Telnet port 23 may be blocked or not enabled on the router"))
      } else if (err.message.includes("ETIMEDOUT") || err.message.includes("EHOSTUNREACH")) {
        reject(new Error("Connection timed out: Router is unreachable"))
      } else if (err.message.includes("ECONNRESET")) {
        reject(new Error("Connection reset by router: Check if Telnet is allowed from this IP"))
      } else {
        reject(new Error(`Telnet error: ${err.message}`))
      }
    })

    socket.on("close", () => {
      if (finished) return
      finished = true
      cleanup()
      log(`Connection closed. Total output: ${output.length} bytes`)
      resolve(output)
    })

    socket.on("timeout", () => {
      if (finished) return
      finished = true
      cleanup()
      log("Socket timeout")
      reject(new Error("Telnet socket timeout"))
    })

    // Set socket timeout
    socket.setTimeout(TELNET_TIMEOUT)

    // Connect
    log(`Connecting to ${host}:${port}...`)
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
  const startTime = Date.now()
  
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
    if (!/^[\w.\-:\[\]]+$/.test(hostClean)) {
      return NextResponse.json({ error: "Invalid host format" }, { status: 400 })
    }

    const portNum = Math.min(65535, Math.max(1, Number(port) || 23))

    console.log(`[v0] Starting Telnet fetch to ${hostClean}:${portNum}`)

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

    console.log(`[v0] Telnet completed in ${Date.now() - startTime}ms, got ${rawOutput.length} bytes`)

    // Parse the output into per-command results
    const commandResults = command
      ? { raw: rawOutput }
      : parseCommandOutput(rawOutput, OSPF_COMMANDS)

    // Log parsed results
    for (const [key, val] of Object.entries(commandResults)) {
      console.log(`[v0] Parsed ${key}: ${(val as string)?.length || 0} chars`)
    }

    // Check if we got any meaningful output
    const hasOutput = Object.values(commandResults).some((v) => v && v.trim().length > 50)
    if (!hasOutput) {
      console.log(`[v0] No meaningful output. Raw output preview: ${rawOutput.substring(0, 500)}`)
      return NextResponse.json(
        { 
          error: "No OSPF data found in router output. Verify OSPF is configured and the user has privilege level 15.",
          debug: rawOutput.substring(0, 1000)
        },
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
    console.error(`[v0] Telnet error after ${Date.now() - startTime}ms:`, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
