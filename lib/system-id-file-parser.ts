/**
 * Parses an uploaded file into a Record<routerId, systemName>.
 *
 * Supported formats:
 *   CSV / TSV   — two columns: ip,name  OR  ip\tname  (header row optional)
 *   KEY=VALUE   — one entry per line:  198.18.1.1=Core-Router-A
 *   JSON        — { "ip": "name", ... }  OR  [{ "ip":"...", "name":"..." }, ...]
 *                 Also accepts common field aliases:
 *                   ip / address / router_id / routerId / router-id / id
 *                   name / system_id / systemId / system-id / hostname / label
 */

type ParsedMap = Record<string, string>

const IP_RE =
  /^(?:\d{1,3}\.){3}\d{1,3}$/

/** All recognised field names that map to the router IP / router-id */
const ID_FIELDS = ["ip", "address", "router_id", "routerid", "router-id", "id"]
/** All recognised field names that map to the human-readable system name */
const NAME_FIELDS = ["name", "system_id", "systemid", "system-id", "hostname", "label", "system_name", "systemname"]

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
}

function pickField(
  obj: Record<string, string>,
  candidates: string[]
): string | undefined {
  for (const c of candidates) {
    const val = obj[c] ?? obj[c.toLowerCase()]
    if (val !== undefined) return String(val).trim()
  }
  return undefined
}

/** True if the string looks like a router IP or dotted-decimal */
function looksLikeIp(s: string): boolean {
  return IP_RE.test(s.trim())
}

// ─── CSV / TSV ────────────────────────────────────────────────────────────────
function parseCsvTsv(text: string): ParsedMap {
  const result: ParsedMap = {}
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return result

  // Detect delimiter
  const delim = lines[0].includes("\t") ? "\t" : ","

  // Parse header (if first cell doesn't look like an IP it's a header row)
  let startIdx = 0
  let ipCol = 0
  let nameCol = 1

  const firstCells = lines[0].split(delim).map((c) => c.trim().replace(/^["']|["']$/g, ""))

  if (!looksLikeIp(firstCells[0])) {
    // Header row present — find column indices
    startIdx = 1
    const normHeaders = firstCells.map(normalise)
    const iIdx = normHeaders.findIndex((h) => ID_FIELDS.includes(h))
    const nIdx = normHeaders.findIndex((h) => NAME_FIELDS.includes(h))
    if (iIdx !== -1) ipCol = iIdx
    if (nIdx !== -1) nameCol = nIdx
  }

  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(delim).map((c) => c.trim().replace(/^["']|["']$/g, ""))
    const ip = cells[ipCol]?.trim()
    const name = cells[nameCol]?.trim()
    if (ip && name) result[ip] = name
  }

  return result
}

// ─── KEY=VALUE ────────────────────────────────────────────────────────────────
function parseKeyValue(text: string): ParsedMap {
  const result: ParsedMap = {}
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim()
    if (!clean || clean.startsWith("#") || clean.startsWith("//")) continue
    const sep = clean.indexOf("=")
    if (sep === -1) continue
    const key = clean.slice(0, sep).trim()
    const val = clean.slice(sep + 1).trim()
    if (key && val) result[key] = val
  }
  return result
}

// ─── JSON ─────────────────────────────────────────────────────────────────────
function parseJson(text: string): ParsedMap {
  const result: ParsedMap = {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return result
  }

  // Plain object: { "ip": "name" }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) result[k.trim()] = v.trim()
    }
    return result
  }

  // Array of objects: [{ ip, name }, ...]
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue
      const obj = item as Record<string, string>
      const normObj: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) {
        normObj[normalise(k)] = String(v).trim()
      }
      const ip = pickField(normObj, ID_FIELDS)
      const name = pickField(normObj, NAME_FIELDS)
      if (ip && name) result[ip] = name
    }
  }

  return result
}

// ─── Auto-detect ─────────────────────────────────────────────────────────────
function detectAndParse(text: string): ParsedMap {
  const trimmed = text.trim()

  // JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const res = parseJson(trimmed)
    if (Object.keys(res).length > 0) return res
  }

  // KEY=VALUE (most lines contain "=")
  const equalsLines = trimmed.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"))
  const hasEquals = equalsLines.filter((l) => l.includes("=")).length
  if (hasEquals > equalsLines.length * 0.5) {
    const res = parseKeyValue(trimmed)
    if (Object.keys(res).length > 0) return res
  }

  // CSV / TSV
  return parseCsvTsv(trimmed)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Parse a File object uploaded by the user. Returns a Promise<ParsedMap>. */
export async function parseSystemIdFile(file: File): Promise<ParsedMap> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== "string") {
        reject(new Error("Could not read file as text."))
        return
      }
      try {
        const result = detectAndParse(text)
        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error("File read error."))
    reader.readAsText(file)
  })
}

/**
 * Merge a newly parsed map into the existing map.
 * New entries override existing ones.
 */
export function mergeSystemIds(
  existing: ParsedMap,
  incoming: ParsedMap
): ParsedMap {
  return { ...existing, ...incoming }
}
