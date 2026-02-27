<!-- Copilot instructions for this repository -->
# OSPF Topology Visualizer — Copilot Instructions

Purpose: help AI coding agents be immediately productive in this Next.js TypeScript codebase.

- Quick start:
  - Dev: `npm run dev` (or `pnpm dev` when using pnpm). This runs `next dev --turbo`.
  - Build: `npm run build`.
  - Start (production): `npm run start`.

- Big picture (what to know first):
  - This is a Next.js 13 app using the `app/` directory. UI components live in `components/` and reusable logic/hooks in `lib/`.
  - Server endpoints are implemented as Route Handlers under `app/api/*` (not `pages/api`). Key routes:
    - `app/api/ospf-poll/route.ts`: in-memory snapshot store — `POST` pushes new raw OSPF text, `GET` returns latest snapshot.
    - `app/api/ssh-fetch/route.ts`: connects to devices using `ssh2`, runs OSPF show commands, and returns raw command output (commands are concatenated with `! Command: <cmd>` separators).
  - Parsing and topology logic: `lib/ospf-parser.ts` parses raw router output into an `OSPFTopology` (routers, networks, links). Use `parseOSPFData(raw)` as canonical parser.
  - Client polling and diffing: `lib/polling-client.ts` (client hook) polls `/api/ospf-poll`, calls `parseOSPFData`, and uses `lib/topology-diff.ts` to compute changes.

- Important project-specific conventions and patterns:
  - Server vs client: files containing React client logic include a `"use client"` directive (e.g., `lib/polling-client.ts`). Route handlers in `app/api` run server-side.
  - Minimal server state: `app/api/ospf-poll/route.ts` keeps the latest snapshot in-memory. Persisting across restarts is intentionally left to deployment (Edge Config / DB) — tests or agents modifying server behavior should be aware.
  - SSH output format: `ssh-fetch` may prepend `! Command:` blocks. The parser tolerates these; when producing test fixtures prefer wrapping outputs as the real route does.
  - Auth: JWT cookie-based sessions implemented in `lib/auth.ts`. Cookie name: `ospf-session`. Use `createToken`/`verifyToken` helpers for tests.
  - Types: canonical types are in `lib/ospf-types.ts`. When manipulating topology objects, follow those shapes (routers/networks/links).

- Integration points & external deps:
  - `ssh2` is used for remote device access (`app/api/ssh-fetch/route.ts`). Tests should mock SSH connections rather than opening real ports.
  - `jose` + `bcryptjs` for JWTs/passwords (`lib/auth.ts`).
  - UI libraries: Radix, Tailwind, `sonner` for toasts — keep UI changes consistent with existing component patterns in `components/ui/`.

- Where to make changes safely:
  - Update parsing logic in `lib/ospf-parser.ts` when adding support for new CLI output variants.
  - Adjust polling behavior in `lib/polling-client.ts` for interval/backoff changes.
  - Server features: add persistence for snapshots outside `app/api/ospf-poll/route.ts` if needed (current file stores in-memory only).

- Examples to reference when coding:
  - To push a snapshot via the API: `POST` JSON to `app/api/ospf-poll` with `{ "data": "<raw output>" }` (see handler top of file).
  - To fetch live topology from client code: `fetch('/api/ospf-poll')` (see `lib/polling-client.ts`).
  - To run SSH fetches in tests, stub `ssh2.Client` and return an aggregated string like the real handler produces.

If anything here is unclear or you want more detail (examples of test stubs, a template for adding persistence, or mapping of types used by `components/topology-canvas.tsx`), tell me which area to expand.
