import { NextResponse } from "next/server"
import { Client } from "ssh2"

const DEFAULT_COMMANDS = [
  "show ip ospf database",
  "show ip ospf database router",
  "show ip ospf database network",
  "show ip ospf database summary",
]

const SSH_TIMEOUT = 30000 // 30 seconds
const COMMAND_TIMEOUT = 20000 // 20 seconds per command

function sshExec(
  conn: Client,
  command: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Command timed out after ${COMMAND_TIMEOUT / 1000}s: ${command}`))
    }, COMMAND_TIMEOUT)

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer)
        return reject(err)
      }

      let output = ""
      let errorOutput = ""

      stream.on("data", (data: Buffer) => {
        output += data.toString()
      })

      stream.stderr.on("data", (data: Buffer) => {
        errorOutput += data.toString()
      })

      stream.on("close", () => {
        clearTimeout(timer)
        if (errorOutput && !output) {
          reject(new Error(errorOutput.trim()))
        } else {
          resolve(output)
        }
      })
    })
  })
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
      enablePassword,
    } = body as {
      host: string
      port?: number
      username: string
      password: string
      command?: string
      enablePassword?: string
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
      return NextResponse.json(
        { error: "Invalid host format" },
        { status: 400 }
      )
    }

    const portNum = Math.min(65535, Math.max(1, Number(port) || 22))

    // Connect via SSH
    const conn = new Client()
    const connectResult = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.end()
        reject(new Error("SSH connection timed out"))
      }, SSH_TIMEOUT)

      conn.on("ready", async () => {
        clearTimeout(timer)
        try {
          // Determine commands to run
          const cmds = command
            ? [command.trim()]
            : DEFAULT_COMMANDS

          let allOutput = ""

          // Try enable mode first if enablePassword is provided
          if (enablePassword) {
            try {
              const enableOut = await sshExec(conn, "enable")
              if (enableOut.includes("Password:") || enableOut.includes("password:")) {
                await sshExec(conn, enablePassword)
              }
            } catch {
              // Enable might not be needed, continue
            }
          }

          // Set terminal length to avoid paging
          try {
            await sshExec(conn, "terminal length 0")
          } catch {
            // Not all devices support this
          }

          for (const cmd of cmds) {
            try {
              const output = await sshExec(conn, cmd)
              if (output.trim()) {
                allOutput += `\n! Command: ${cmd}\n`
                allOutput += output
                allOutput += "\n"
              }
            } catch (cmdErr) {
              allOutput += `\n! Command failed: ${cmd} - ${cmdErr instanceof Error ? cmdErr.message : "Unknown error"}\n`
            }
          }

          conn.end()

          if (!allOutput.trim()) {
            reject(new Error("No output received from router. Check if OSPF is configured."))
          } else {
            resolve(allOutput.trim())
          }
        } catch (execErr) {
          conn.end()
          reject(execErr)
        }
      })

      conn.on("error", (err) => {
        clearTimeout(timer)
        reject(new Error(`SSH connection failed: ${err.message}`))
      })

      conn.connect({
        host: hostClean,
        port: portNum,
        username: username.trim(),
        password,
        readyTimeout: SSH_TIMEOUT,
        algorithms: {
          kex: [
            "ecdh-sha2-nistp256",
            "ecdh-sha2-nistp384",
            "ecdh-sha2-nistp521",
            "diffie-hellman-group-exchange-sha256",
            "diffie-hellman-group14-sha256",
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group1-sha1",
          ],
          cipher: [
            "aes128-ctr",
            "aes192-ctr",
            "aes256-ctr",
            "aes128-gcm",
            "aes256-gcm",
            "aes256-cbc",
            "aes128-cbc",
            "3des-cbc",
          ],
        },
        // Some older Cisco devices need this
        tryKeyboard: true,
      })
    })

    return NextResponse.json({
      success: true,
      data: connectResult,
      host: hostClean,
      timestamp: Date.now(),
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown SSH error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
