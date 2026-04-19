export const DEFAULT_PERMISSION = "edit";
export const DB_FILENAME = "file-guard.db";

// Tools whose calls we intercept and gate against the file ACL
export const GATED_TOOLS = new Set([
  "write",
  "edit",
  "apply_patch",
  "exec",
  "process",
]);
