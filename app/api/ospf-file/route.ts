import { NextResponse } from "next/server"
import { readFile, stat } from "fs/promises"
import { existsSync } from "fs"

// Path to the OSPF data file on the server
const OSPF_FILE_PATH = "/root/ospf_upload_file_dir/ospf_data.txt"

export async function GET() {
  try {
    // Check if file exists
    if (!existsSync(OSPF_FILE_PATH)) {
      return NextResponse.json(
        { error: `File not found: ${OSPF_FILE_PATH}` },
        { status: 404 }
      )
    }

    // Get file stats for last modified time
    const stats = await stat(OSPF_FILE_PATH)
    const lastModified = stats.mtime.toISOString()

    // Read the file content
    const content = await readFile(OSPF_FILE_PATH, "utf-8")

    if (!content.trim()) {
      return NextResponse.json(
        { error: "File is empty" },
        { status: 400 }
      )
    }

    // Return the file content with metadata
    return NextResponse.json({
      success: true,
      data: content,
      lastModified,
      filePath: OSPF_FILE_PATH,
      fileSize: stats.size,
      timestamp: Date.now(),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read file"
    console.error("[v0] Error reading OSPF file:", message)
    
    // Check for permission errors
    if (message.includes("EACCES") || message.includes("permission denied")) {
      return NextResponse.json(
        { error: `Permission denied: Cannot read ${OSPF_FILE_PATH}. Check file permissions.` },
        { status: 403 }
      )
    }
    
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
