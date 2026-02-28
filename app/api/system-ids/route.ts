import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

// GET all system IDs
export async function GET() {
  try {
    const rows = await sql`SELECT router_id, system_name FROM ospf_system_ids ORDER BY router_id`
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.router_id] = row.system_name
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error("[v0] GET /api/system-ids error:", err)
    return NextResponse.json({ error: "Failed to load system IDs" }, { status: 500 })
  }
}

// POST upsert one or many system IDs
// Body: { routerId: string, systemName: string } | { entries: Record<string, string> }
export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (body.entries && typeof body.entries === "object") {
      // Bulk upsert
      const entries = Object.entries(body.entries) as [string, string][]
      if (entries.length === 0) return NextResponse.json({ ok: true })
      for (const [routerId, systemName] of entries) {
        await sql`
          INSERT INTO ospf_system_ids (router_id, system_name, updated_at)
          VALUES (${routerId}, ${systemName}, NOW())
          ON CONFLICT (router_id) DO UPDATE
            SET system_name = EXCLUDED.system_name, updated_at = NOW()
        `
      }
    } else {
      // Single upsert
      const { routerId, systemName } = body as { routerId: string; systemName: string }
      if (!routerId || systemName === undefined) {
        return NextResponse.json({ error: "routerId and systemName required" }, { status: 400 })
      }
      await sql`
        INSERT INTO ospf_system_ids (router_id, system_name, updated_at)
        VALUES (${routerId}, ${systemName}, NOW())
        ON CONFLICT (router_id) DO UPDATE
          SET system_name = EXCLUDED.system_name, updated_at = NOW()
      `
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[v0] POST /api/system-ids error:", err)
    return NextResponse.json({ error: "Failed to save system ID" }, { status: 500 })
  }
}

// DELETE one or all system IDs
// Body: { routerId: string } to delete one, {} to delete all
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    if (body.routerId) {
      await sql`DELETE FROM ospf_system_ids WHERE router_id = ${body.routerId}`
    } else {
      await sql`DELETE FROM ospf_system_ids`
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[v0] DELETE /api/system-ids error:", err)
    return NextResponse.json({ error: "Failed to delete system ID" }, { status: 500 })
  }
}
