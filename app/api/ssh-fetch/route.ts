import { NextResponse } from "next/server"
import { spawn } from "child_process"

// The 6 OSPF commands we need, mapped to MultiCommandInput keys
const OSPF_COMMANDS: Array<{ key: string; cmd: string }> = [
  { key: "showIpOspf", cmd: "show ip ospf" },
  { key: "showIpOspfNeighbor", cmd: "show ip ospf neighbor" },
  { key: "showIpOspfDatabaseRouter", cmd: "show ip ospf database router" },
  { key: "showIpOspfDatabaseNetwork", cmd: "show ip ospf database network" },
  { key: "showIpOspfInterface", cmd: "show ip ospf interface" },
  { key: "showIpRouteOspf", cmd: "show ip route ospf" },
]

const SSH_TIMEOUT = 45000 // 45 seconds total

/**
 * Execute SSH commands using the system's native ssh client.
 * This bypasses the ssh2 library's native binding requirement for legacy algorithms.
 * The host OS's ssh client already supports diffie-hellman-group-exchange-sha1 and ssh-rsa.
 */
function execSSH(
  host: string,
  port: number,
  username: string,
  password: string,
  commands: string[]
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Build the command script to send to the router
    // We use terminal length 0 to disable paging, then run all commands
    const script = [
      "terminal length 0",
      ...commands,
      "exit",
    ].join("\n")

    // SSH options to enable legacy algorithms that Cisco IOS requires
    const sshArgs = [
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "KexAlgorithms=+diffie-hellman-group-exchange-sha1,diffie-hellman-group14-sha1,diffie-hellman-group1-sha1",
      "-o", "HostKeyAlgorithms=+ssh-rsa",
      "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
      "-o", "Ciphers=+aes128-ctr,aes192-ctr,aes256-ctr,aes128-cbc,aes256-cbc,3des-cbc",
      "-o", "MACs=+hmac-sha2-256,hmac-sha2-512,hmac-sha1,hmac-md5",
      "-o", "ConnectTimeout=15",
      "-o", "ServerAliveInterval=5",
      "-o", "ServerAliveCountMax=3",
      "-o", "BatchMode=no",
      "-o", "PreferredAuthentications=keyboard-interactive,password",
      "-p", String(port),
      "-l", username,
      host,
    ]

    let output = ""
    let errorOutput = ""
    let passwordSent = false
    let finished = false

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true
        sshProcess.kill("SIGTERM")
        reject(new Error(`SSH connection timed out after ${SSH_TIMEOUT / 1000}s`))
      }
    }, SSH_TIMEOUT)

    const sshProcess = spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, SSH_ASKPASS_REQUIRE: "never" },
    })

    sshProcess.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString()
      output += chunk

      // Detect password prompt and send password
      if (!passwordSent && /[Pp]assword[:\s]*$/i.test(output)) {
        passwordSent = true
        sshProcess.stdin.write(password + "\n")
        
        // After password, wait a moment then send commands
        setTimeout(() => {
          if (!finished) {
            sshProcess.stdin.write(script + "\n")
          }
        }, 500)
      }
    })

    sshProcess.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString()
      errorOutput += chunk

      // Also check stderr for password prompt (some ssh versions use stderr)
      if (!passwordSent && /[Pp]assword[:\s]*$/i.test(errorOutput)) {
        passwordSent = true
        sshProcess.stdin.write(password + "\n")
        
        setTimeout(() => {
          if (!finished) {
            sshProcess.stdin.write(script + "\n")
          }
        }, 500)
      }
    })

    sshProcess.on("close", (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)

      if (code !== 0 && !output.trim()) {
        // Check for common error messages
        if (errorOutput.includes("Permission denied")) {
          reject(new Error("Authentication failed: Invalid username or password"))
        } else if (errorOutput.includes("Connection refused")) {
          reject(new Error("Connection refused: SSH port may be blocked or not running"))
        } else if (errorOutput.includes("Connection timed out") || errorOutput.includes("No route to host")) {
          reject(new Error("Connection timed out: Router is unreachable"))
        } else if (errorOutput.includes("Host key verification failed")) {
          reject(new Error("Host key verification failed"))
        } else {
          reject(new Error(errorOutput.trim() || `SSH exited with code ${code}`))
        }
      } else {
        resolve(output)
      }
    })

    sshProcess.on("error", (err) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      reject(new Error(`Failed to spawn ssh: ${err.message}`))
    })
  })
}

/**
 * Parse raw SSH output into per-command results.
 * The output contains all commands run sequentially with their prompts.
 */
function parseCommandOutput(
  raw: string,
  commands: Array<{ key: string; cmd: string }>
): Record<string, string> {
  const results: Record<string, string> = {}

  for (let i = 0; i < commands.length; i++) {
    const { key, cmd } = commands[i]
    const nextCmd = commands[i + 1]?.cmd

    // Find this command in the output
    const cmdIndex = raw.indexOf(cmd)
    if (cmdIndex === -1) {
      results[key] = ""
      continue
    }

    // Find where the output for this command starts (after the command line)
    const startIndex = cmdIndex + cmd.length
    
    // Find where the next command or prompt starts
    let endIndex = raw.length
    if (nextCmd) {
      const nextIndex = raw.indexOf(nextCmd, startIndex)
      if (nextIndex !== -1) {
        endIndex = nextIndex
      }
    }
    
    // Also look for the router prompt (e.g., "Router#" or "hostname#")
    const promptMatch = raw.slice(startIndex, endIndex).match(/\r?\n[\w\-\.]+[>#]\s*$/m)
    if (promptMatch && promptMatch.index !== undefined) {
      endIndex = startIndex + promptMatch.index
    }

    // Extract and clean the output
    let output = raw.slice(startIndex, endIndex)
    // Remove leading/trailing whitespace and common prompt patterns
    output = output
      .replace(/^\s*\r?\n/, "")  // Remove leading newline
      .replace(/\r?\n[\w\-\.]+[>#]\s*$/, "")  // Remove trailing prompt
      .trim()

    results[key] = output
  }

  return results
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      host,
      port = 22,
      username,
      password,
      command,
    } = body as {
      host: string
      port?: number
      username: string
      password: string
      command?: string
    }

    // Validate
    if (!host || !username || !password) {
      return NextResponse.json(
        { error: "Missing required fields: host, username, password" },
        { status: 400 }
      )
    }

    // Sanitize host -- only allow IP/hostname
    const hostClean = host.trim()
    if (!/^[\w.\-:]+$/.test(hostClean)) {
      return NextResponse.json({ error: "Invalid host format" }, { status: 400 })
    }

    const portNum = Math.min(65535, Math.max(1, Number(port) || 22))

    // Determine which commands to run
    const commandsToRun = command
      ? [{ key: "raw", cmd: command.trim() }]
      : OSPF_COMMANDS

    // Execute SSH
    const rawOutput = await execSSH(
      hostClean,
      portNum,
      username.trim(),
      password,
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
        { error: "No output received from router. Check if OSPF is configured." },
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
    const message = err instanceof Error ? err.message : "Unknown SSH error"
    console.error("[v0] SSH error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
