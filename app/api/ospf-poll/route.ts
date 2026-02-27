import { NextResponse } from "next/server"

// In-memory store for latest OSPF snapshot
// In production, use Edge Config or a database
let latestSnapshot: {
  raw: string
  timestamp: number
} | null = null

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || ""
    let raw: string

    if (contentType.includes("application/json")) {
      const body = await request.json()
      raw = body.data || body.raw || ""
    } else {
      raw = await request.text()
    }

    if (!raw.trim()) {
      return NextResponse.json(
        { error: "Empty OSPF data" },
        { status: 400 }
      )
    }

    latestSnapshot = {
      raw: raw.trim(),
      timestamp: Date.now(),
    }

    return NextResponse.json({
      success: true,
      timestamp: latestSnapshot.timestamp,
      size: raw.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process OSPF data", details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  if (!latestSnapshot) {
    return NextResponse.json({ snapshot: null })
  }

  return NextResponse.json({
    snapshot: {
      raw: latestSnapshot.raw,
      timestamp: latestSnapshot.timestamp,
    },
  })
}
