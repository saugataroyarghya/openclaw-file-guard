import type { FileGuardStore } from "../store/file-guard-store.js";
import type { CommandContext, CommandResult } from "./types.js";

export function handleProtected(
  ctx: CommandContext,
  deps: { store: FileGuardStore },
): CommandResult {
  const owned = deps.store.listProtectionsForOwner(ctx.agentId, ctx.userId);
  const grants = deps.store.listGrantsForUser(ctx.agentId, ctx.userId);

  if (owned.length === 0 && grants.length === 0) {
    return { text: "You don't own or have access to any protected files." };
  }

  const lines: string[] = [];

  if (owned.length > 0) {
    lines.push(`*Files you own (${owned.length}):*`);
    for (const row of owned) {
      const fileGrants = deps.store.listGrantsForFile(ctx.agentId, row.file_path);
      const grantInfo =
        fileGrants.length > 0
          ? ` (granted to: ${fileGrants.map((g) => g.grantee_user_id).join(", ")})`
          : "";
      lines.push(`- ${row.file_path}${grantInfo}`);
    }
  }

  if (grants.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`*Files you have access to (${grants.length}):*`);
    for (const row of grants) {
      lines.push(`- ${row.file_path} (${row.permission}, owner: ${row.granted_by})`);
    }
  }

  return { text: lines.join("\n") };
}
