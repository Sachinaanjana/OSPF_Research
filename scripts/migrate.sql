-- OSPF Topology snapshots table
-- Stores full raw LSA text + parsed topology JSON per snapshot
CREATE TABLE IF NOT EXISTS ospf_snapshots (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  raw_text    TEXT NOT NULL,
  topology    JSONB NOT NULL,
  router_count INTEGER NOT NULL DEFAULT 0,
  network_count INTEGER NOT NULL DEFAULT 0,
  area_count  INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ssh' | 'polling'
  host        TEXT,                            -- SSH host if applicable
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast list queries
CREATE INDEX IF NOT EXISTS ospf_snapshots_created_at_idx ON ospf_snapshots (created_at DESC);
