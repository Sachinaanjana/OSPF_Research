import { NextResponse } from "next/server"
import { put, list, del } from "@vercel/blob"

const BLOB_FILENAME = "ospf_data.txt"

/**
 * GET - Retrieve the latest OSPF database router output
 */
export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_FILENAME })
    
    if (blobs.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: "No OSPF data found" 
      }, { status: 404 })
    }

    // Get the most recent blob
    const latestBlob = blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0]

    // Fetch the content
    const response = await fetch(latestBlob.url)
    const content = await response.text()

    return NextResponse.json({
      success: true,
      data: content,
      uploadedAt: latestBlob.uploadedAt,
      size: latestBlob.size,
    })
  } catch (err) {
    console.error("[v0] Error reading OSPF data:", err)
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : "Failed to read OSPF data" 
    }, { status: 500 })
  }
}

/**
 * POST - Save new OSPF database router output
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { data, host } = body as { data: string; host?: string }

    if (!data || typeof data !== "string") {
      return NextResponse.json({ 
        success: false, 
        error: "Missing or invalid data" 
      }, { status: 400 })
    }

    // Add metadata header
    const timestamp = new Date().toISOString()
    const content = `# OSPF Database Router Output
# Uploaded: ${timestamp}
# Host: ${host || "unknown"}
# -------------------------------------------

${data}`

    // Delete old blobs with the same prefix to avoid accumulation
    const { blobs: existingBlobs } = await list({ prefix: BLOB_FILENAME })
    for (const blob of existingBlobs) {
      await del(blob.url)
    }

    // Upload new data
    const blob = await put(BLOB_FILENAME, content, {
      access: "public",
      contentType: "text/plain",
    })

    console.log(`[v0] OSPF data saved to blob: ${blob.url} (${content.length} bytes)`)

    return NextResponse.json({
      success: true,
      url: blob.url,
      uploadedAt: timestamp,
      size: content.length,
    })
  } catch (err) {
    console.error("[v0] Error saving OSPF data:", err)
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : "Failed to save OSPF data" 
    }, { status: 500 })
  }
}

/**
 * DELETE - Remove all OSPF data blobs
 */
export async function DELETE() {
  try {
    const { blobs } = await list({ prefix: BLOB_FILENAME })
    
    for (const blob of blobs) {
      await del(blob.url)
    }

    return NextResponse.json({
      success: true,
      deleted: blobs.length,
    })
  } catch (err) {
    console.error("[v0] Error deleting OSPF data:", err)
    return NextResponse.json({ 
      success: false, 
      error: err instanceof Error ? err.message : "Failed to delete OSPF data" 
    }, { status: 500 })
  }
}
