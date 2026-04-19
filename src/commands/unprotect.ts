import type { FileGuardStore } from "../store/file-guard-store.js";
import { normalizePath } from "../gate/path-extractor.js";
import type { CommandContext, CommandResult } from "./types.js";

export function handleUnprotect(
  ctx: CommandContext,
  deps: { store: FileGuardStore },
): CommandResult {
  const path = ctx.args.trim();
  if (!path) {
    return { text: "Usage: /unprotect <path>" };
  }

  const normalized = normalizePath(path);
  if (!normalized) {
    return { text: `Invalid path: ${path}` };
  }

  const protection = deps.store.getProtection(ctx.agentId, normalized);
  if (!protection) {
    return { text: `${normalized} is not protected.` };
  }

  if (protection.owner_user_id !== ctx.userId) {
    return {
      text: `Only the owner (${protection.owner_user_id}) can unprotect this file.`,
    };
  }

  deps.store.unprotectFile(ctx.agentId, normalized);

  deps.store.logAudit({
    agentId: ctx.agentId,
    action: "unprotect",
    targetPath: normalized,
    actorUserId: ctx.userId,
  });

  return { text: `Unprotected ${normalized}. Anyone can edit it now.` };
}
