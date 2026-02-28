import { NextResponse } from "next/server"

// DB temporarily disabled — returns empty list
export async function GET() {
  return NextResponse.json({ snapshots: [] })
}

export async function POST() {
  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}
