import { neon } from "@neondatabase/serverless"
import { type NextRequest, NextResponse } from "next/server"

const sql = neon(process.env.DATABASE_URL!)

// GET /api/snapshots — list all snapshots (latest first)
export async function GET() {
  try {
    const rows = await sql`
      SELECT id, name, source, host, router_count, network_count, area_count, created_at
      FROM ospf_snapshots
      ORDER BY created_at DESC
      LIMIT 100
    `
    return NextResponse.json({ snapshots: rows })
  } catch (err) {
    console.error("[snapshots GET]", err)
    return NextResponse.json({ error: "Failed to load snapshots" }, { status: 500 })
  }
}

// POST /api/snapshots — save a new snapshot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, source, host, raw_text, topology } = body

    if (!topology) {
      return NextResponse.json({ error: "topology is required" }, { status: 400 })
    }

    const router_count = topology.routers?.length ?? 0
    const network_count = topology.networks?.length ?? 0
    const area_count = topology.areas?.length ?? 0

    const rows = await sql`
      INSERT INTO ospf_snapshots (name, source, host, raw_text, topology, router_count, network_count, area_count)
      VALUES (${name ?? null}, ${source ?? "manual"}, ${host ?? null}, ${raw_text ?? null}, ${JSON.stringify(topology)}, ${router_count}, ${network_count}, ${area_count})
      RETURNING id, name, source, host, router_count, network_count, area_count, created_at
    `
    return NextResponse.json({ snapshot: rows[0] })
  } catch (err) {
    console.error("[snapshots POST]", err)
    return NextResponse.json({ error: "Failed to save snapshot" }, { status: 500 })
  }
}

// DELETE /api/snapshots — clear all snapshots
export async function DELETE() {
  try {
    await sql`DELETE FROM ospf_snapshots`
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[snapshots DELETE]", err)
    return NextResponse.json({ error: "Failed to clear snapshots" }, { status: 500 })
  }
}
