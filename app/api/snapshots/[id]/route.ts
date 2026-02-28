import { NextResponse } from "next/server"

// DB temporarily disabled
export async function GET() {
  return NextResponse.json({ error: "Database temporarily disabled" }, { status: 503 })
}

export async function DELETE() {
  return NextResponse.json({ ok: true })
}
