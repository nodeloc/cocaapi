CREATE TABLE IF NOT EXISTS "CommerceLoginConfiguration" (
    id TEXT PRIMARY KEY CHECK (id='login'),
    payload TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision>0),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
