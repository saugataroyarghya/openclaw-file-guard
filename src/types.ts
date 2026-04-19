// ── Plugin Config ──

export type AlwaysProtectedEntry = {
  path: string;
  ownerUserId: string;
  grantees?: string[];
};

export type FileGuardPluginConfig = {
  watchedPaths?: string[];
  alwaysProtected?: AlwaysProtectedEntry[];
};

// ── Database Row Types ──

export type ProtectedFileRow = {
  agent_id: string;
  file_path: string;
  owner_user_id: string;
  protected_at: number;
};

export type FileGrantRow = {
  agent_id: string;
  file_path: string;
  grantee_user_id: string;
  granted_by: string;
  permission: string;
  granted_at: number;
};

export type AuditAction = "protect" | "unprotect" | "grant" | "revoke" | "block";

export type AuditLogRow = {
  id: number;
  agent_id: string;
  action: AuditAction;
  target_path: string | null;
  actor_user_id: string;
  tool_name: string | null;
  metadata: string | null;
  timestamp: number;
};

// ── User Identity ──

export type UserIdentity = {
  channel: string;
  userId: string;
};

// ── Permission Check Result ──

export type PermissionDecision =
  | { allowed: true }
  | { allowed: false; reason: string };
