CREATE TABLE IF NOT EXISTS monitor_head (
 id INTEGER PRIMARY KEY CHECK(id=1), baseline_version TEXT NOT NULL, baseline_url TEXT NOT NULL,
 baseline_cursor INTEGER NOT NULL DEFAULT 0, baseline_poll_count INTEGER NOT NULL DEFAULT 0,
 seq INTEGER NOT NULL DEFAULT 0, poll_count INTEGER NOT NULL DEFAULT 0, source_json TEXT,
 success_at TEXT, attempt_at TEXT, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 error TEXT, failures INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, lease_owner TEXT,
 last_gap_seconds REAL NOT NULL DEFAULT 0, max_gap_seconds REAL NOT NULL DEFAULT 0,
 checkpoint_checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS monitor_events (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, poll_count INTEGER NOT NULL, at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS monitor_gaps (
 id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, duration_seconds REAL, message TEXT
);
