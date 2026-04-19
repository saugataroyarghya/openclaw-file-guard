import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS protected_files (
      agent_id        TEXT    NOT NULL,
      file_path       TEXT    NOT NULL,
      owner_user_id   TEXT    NOT NULL,
      protected_at    INTEGER NOT NULL,
      PRIMARY KEY (agent_id, file_path)
    );

    CREATE INDEX IF NOT EXISTS idx_protected_owner
      ON protected_files (agent_id, owner_user_id);

    CREATE TABLE IF NOT EXISTS file_grants (
      agent_id          TEXT    NOT NULL,
      file_path         TEXT    NOT NULL,
      grantee_user_id   TEXT    NOT NULL,
      granted_by        TEXT    NOT NULL,
      permission        TEXT    NOT NULL,
      granted_at        INTEGER NOT NULL,
      PRIMARY KEY (agent_id, file_path, grantee_user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_grants_grantee
      ON file_grants (agent_id, grantee_user_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id        TEXT    NOT NULL,
      action          TEXT    NOT NULL,
      target_path     TEXT,
      actor_user_id   TEXT    NOT NULL,
      tool_name       TEXT,
      metadata        TEXT,
      timestamp       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_lookup
      ON audit_log (agent_id, actor_user_id, timestamp);
  `);
}
