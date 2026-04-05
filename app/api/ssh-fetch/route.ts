import { NextResponse } from "next/server"
import { Client } from "ssh2"

// The 6 OSPF commands we need, mapped to MultiCommandInput keys
const OSPF_COMMANDS: Array<{ key: string; cmd: string }> = [
  { key: "showIpOspf",                  cmd: "show ip ospf" },
  { key: "showIpOspfNeighbor",          cmd: "show ip ospf neighbor" },
  { key: "showIpOspfDatabaseRouter",    cmd: "show ip ospf database router" },
  { key: "showIpOspfDatabaseNetwork",   cmd: "show ip ospf database network" },
  { key: "showIpOspfInterface",         cmd: "show ip ospf interface" },
  { key: "showIpRouteOspf",             cmd: "show ip route ospf" },
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
          // Try enable mode first if enablePassword is provided
          if (enablePassword) {
            try {
              await sshExec(conn, "enable")
            } catch {
              // Enable might not be needed, continue
            }
            try {
              await sshExec(conn, enablePassword)
            } catch {
              // May not need password entry
            }
          }

          // Set terminal length to avoid paging (Cisco IOS)
          try {
            await sshExec(conn, "terminal length 0")
          } catch {
            // Not all devices support this
          }
          // Also try terminal pager 0 (some variants)
          try {
            await sshExec(conn, "terminal pager 0")
          } catch { /* ignore */ }

          // If a custom single command was requested, run only that
          if (command && command.trim()) {
            const output = await sshExec(conn, command.trim())
            conn.end()
            if (!output.trim()) {
              reject(new Error("No output received from router."))
            } else {
              resolve(JSON.stringify({ raw: output.trim() }))
            }
            return
          }

          // Run all 6 OSPF commands and map output to MultiCommandInput keys
          const commandResults: Record<string, string> = {}
          let anyOutput = false

          for (const { key, cmd } of OSPF_COMMANDS) {
            try {
              const output = await sshExec(conn, cmd)
              if (output.trim()) {
                commandResults[key] = output.trim()
                anyOutput = true
              }
            } catch (cmdErr) {
              // Store error note so the UI knows this command ran but failed
              commandResults[key] = `! Command failed: ${cmd} — ${cmdErr instanceof Error ? cmdErr.message : "Unknown error"}`
            }
          }

          conn.end()

          if (!anyOutput) {
            reject(new Error("No output received from router. Check if OSPF is configured."))
          } else {
            resolve(JSON.stringify(commandResults))
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

      // Handle keyboard-interactive auth (some Cisco IOS versions require this
      // even with password auth — the router sends a "Password:" challenge)
      conn.on("keyboard-interactive", (_name, _instructions, _lang, prompts, finish) => {
        // Respond to every prompt with the password
        finish(prompts.map(() => password))
      })

      conn.connect({
        host: hostClean,
        port: portNum,
        username: username.trim(),
        password,
        readyTimeout: SSH_TIMEOUT,
        algorithms: {
          // Key exchange — list every method the router advertises first so
          // ssh2 will negotiate one successfully even on old Cisco IOS boxes.
          kex: [
            "diffie-hellman-group-exchange-sha1",   // ← what the router offers
            "diffie-hellman-group14-sha1",           // ← what the router offers
            "diffie-hellman-group-exchange-sha256",
            "diffie-hellman-group14-sha256",
            "diffie-hellman-group1-sha1",
            "ecdh-sha2-nistp256",
            "ecdh-sha2-nistp384",
            "ecdh-sha2-nistp521",
          ],
          // Host-key — older IOS sends ssh-rsa; Node ≥ 21 / ssh2 ≥ 1.15
          // disables it by default, so we must re-enable it explicitly.
          serverHostKey: [
            "ssh-rsa",
            "ecdsa-sha2-nistp256",
            "ecdsa-sha2-nistp384",
            "ecdsa-sha2-nistp521",
            "ssh-ed25519",
          ],
          cipher: [
            "aes128-ctr",
            "aes192-ctr",
            "aes256-ctr",
            "aes128-cbc",
            "aes256-cbc",
            "3des-cbc",
          ],
          hmac: [
            "hmac-sha2-256",
            "hmac-sha2-512",
            "hmac-sha1",
            "hmac-md5",
          ],
        },
        // Keyboard-interactive fallback for Cisco password prompts
        tryKeyboard: true,
      })
    })

    return NextResponse.json({
      success: true,
      data: connectResult,          // JSON string of MultiCommandInput keys
      host: hostClean,
      timestamp: Date.now(),
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown SSH error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
