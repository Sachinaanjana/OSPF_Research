import { put, get, list } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

const BLOB_PATHNAME = "ospf_data/ospf_database_router.txt"

/**
 * GET /api/ospf-data
 * Retrieve the latest saved OSPF database router output
 */
export async function GET(request: NextRequest) {
  try {
    // List blobs to find our file
    const { blobs } = await list({ prefix: "ospf_data/" })
    const ospfBlob = blobs.find((b) => b.pathname === BLOB_PATHNAME)

    if (!ospfBlob) {
      return NextResponse.json(
        { error: "No OSPF data found. Connect to a router first." },
        { status: 404 }
      )
    }

    // Fetch the blob content
    const result = await get(BLOB_PATHNAME, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return NextResponse.json({ error: "OSPF data not found" }, { status: 404 })
    }

    // Handle 304 Not Modified
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    // Read the stream as text
    const text = await new Response(result.stream).text()

    return NextResponse.json({
      data: text,
      uploadedAt: ospfBlob.uploadedAt,
      size: ospfBlob.size,
    })
  } catch (error) {
    console.error("[v0] Error reading OSPF data from Blob:", error)
    return NextResponse.json(
      { error: "Failed to read OSPF data" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ospf-data
 * Save OSPF database router output to Blob storage
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { data, host } = body as { data: string; host?: string }

    if (!data || typeof data !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'data' field" },
        { status: 400 }
      )
    }

    // Add metadata header with timestamp and source
    const timestamp = new Date().toISOString()
    const header = [
      `! OSPF Database Router Output`,
      `! Captured at: ${timestamp}`,
      `! Source: ${host || "Unknown"}`,
      `! Auto-saved by OSPF Research Tool`,
      `!`,
      ``,
    ].join("\n")

    const content = header + data

    // Upload to Blob (overwrites existing file)
    const blob = await put(BLOB_PATHNAME, content, {
      access: "private",
      addRandomSuffix: false, // Keep consistent filename
      contentType: "text/plain",
    })

    console.log(`[v0] OSPF data saved to Blob: ${blob.pathname} (${content.length} bytes)`)

    return NextResponse.json({
      success: true,
      pathname: blob.pathname,
      uploadedAt: timestamp,
      size: content.length,
    })
  } catch (error) {
    console.error("[v0] Error saving OSPF data to Blob:", error)
    return NextResponse.json(
      { error: "Failed to save OSPF data" },
      { status: 500 }
    )
  }
}
