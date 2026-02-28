import { neon } from "@neondatabase/serverless"
import { type NextRequest, NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

// GET /api/snapshots/[id] — load one snapshot (full topology JSON)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const rows = await sql`
      SELECT id, name, source, host, raw_text, topology, router_count, network_count, area_count, created_at
      FROM ospf_snapshots
      WHERE id = ${Number(id)}
    `
    if (rows.length === 0) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 })
    }
    return NextResponse.json({ snapshot: rows[0] })
  } catch (err) {
    console.error("[snapshots/[id] GET]", err)
    return NextResponse.json({ error: "Failed to load snapshot" }, { status: 500 })
  }
}

// DELETE /api/snapshots/[id] — delete a single snapshot
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await sql`DELETE FROM ospf_snapshots WHERE id = ${Number(id)}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[snapshots/[id] DELETE]", err)
    return NextResponse.json({ error: "Failed to delete snapshot" }, { status: 500 })
  }
}
