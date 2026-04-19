import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

import type {
  AuditAction,
  AuditLogRow,
  FileGrantRow,
  ProtectedFileRow,
} from "../types.js";
import { runMigrations } from "./migrations.js";

export class FileGuardStore {
  private db: Database.Database;

  constructor({ dbPath }: { dbPath: string }) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    runMigrations(this.db);
  }

  // ── Protected Files ──

  protectFile(params: {
    agentId: string;
    filePath: string;
    ownerUserId: string;
  }): void {
    const { agentId, filePath, ownerUserId } = params;
    const stmt = this.db.prepare(`
      INSERT INTO protected_files (agent_id, file_path, owner_user_id, protected_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (agent_id, file_path) DO NOTHING
    `);
    stmt.run(agentId, filePath, ownerUserId, Date.now());
  }

  getProtection(agentId: string, filePath: string): ProtectedFileRow | null {
    const stmt = this.db.prepare<[string, string]>(
      `SELECT * FROM protected_files WHERE agent_id = ? AND file_path = ?`,
    );
    return (stmt.get(agentId, filePath) as ProtectedFileRow) ?? null;
  }

  listProtectionsForOwner(agentId: string, ownerUserId: string): ProtectedFileRow[] {
    const stmt = this.db.prepare<[string, string]>(
      `SELECT * FROM protected_files
       WHERE agent_id = ? AND owner_user_id = ?
       ORDER BY protected_at DESC`,
    );
    return stmt.all(agentId, ownerUserId) as ProtectedFileRow[];
  }

  listAllProtections(agentId: string): ProtectedFileRow[] {
    const stmt = this.db.prepare<[string]>(
      `SELECT * FROM protected_files WHERE agent_id = ?`,
    );
    return stmt.all(agentId) as ProtectedFileRow[];
  }

  unprotectFile(agentId: string, filePath: string): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(`DELETE FROM file_grants WHERE agent_id = ? AND file_path = ?`)
        .run(agentId, filePath);
      this.db
        .prepare(`DELETE FROM protected_files WHERE agent_id = ? AND file_path = ?`)
        .run(agentId, filePath);
    });
    tx();
  }

  // ── Grants ──

  grantAccess(params: {
    agentId: string;
    filePath: string;
    granteeUserId: string;
    grantedBy: string;
    permission: string;
  }): void {
    const { agentId, filePath, granteeUserId, grantedBy, permission } = params;
    const stmt = this.db.prepare(`
      INSERT INTO file_grants
        (agent_id, file_path, grantee_user_id, granted_by, permission, granted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (agent_id, file_path, grantee_user_id) DO UPDATE SET
        granted_by = excluded.granted_by,
        permission = excluded.permission,
        granted_at = excluded.granted_at
    `);
    stmt.run(agentId, filePath, granteeUserId, grantedBy, permission, Date.now());
  }

  revokeAccess(agentId: string, filePath: string, granteeUserId: string): void {
    this.db
      .prepare(
        `DELETE FROM file_grants
         WHERE agent_id = ? AND file_path = ? AND grantee_user_id = ?`,
      )
      .run(agentId, filePath, granteeUserId);
  }

  hasGrant(
    agentId: string,
    filePath: string,
    userId: string,
  ): FileGrantRow | null {
    const stmt = this.db.prepare<[string, string, string]>(
      `SELECT * FROM file_grants
       WHERE agent_id = ? AND file_path = ? AND grantee_user_id = ?`,
    );
    return (stmt.get(agentId, filePath, userId) as FileGrantRow) ?? null;
  }

  listGrantsForFile(agentId: string, filePath: string): FileGrantRow[] {
    const stmt = this.db.prepare<[string, string]>(
      `SELECT * FROM file_grants WHERE agent_id = ? AND file_path = ?`,
    );
    return stmt.all(agentId, filePath) as FileGrantRow[];
  }

  listGrantsForUser(agentId: string, userId: string): FileGrantRow[] {
    const stmt = this.db.prepare<[string, string]>(
      `SELECT * FROM file_grants WHERE agent_id = ? AND grantee_user_id = ?`,
    );
    return stmt.all(agentId, userId) as FileGrantRow[];
  }

  // ── Audit Log ──

  logAudit(params: {
    agentId: string;
    action: AuditAction;
    targetPath?: string;
    actorUserId: string;
    toolName?: string;
    metadata?: string;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log
        (agent_id, action, target_path, actor_user_id, tool_name, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      params.agentId,
      params.action,
      params.targetPath ?? null,
      params.actorUserId,
      params.toolName ?? null,
      params.metadata ?? null,
      Date.now(),
    );
  }

  getAuditLog(agentId: string, limit = 100): AuditLogRow[] {
    const stmt = this.db.prepare<[string, number]>(
      `SELECT * FROM audit_log
       WHERE agent_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    );
    return stmt.all(agentId, limit) as AuditLogRow[];
  }

  // ── Lifecycle ──

  close(): void {
    this.db.close();
  }
}
