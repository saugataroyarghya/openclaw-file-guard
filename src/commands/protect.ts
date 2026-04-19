import type { FileGuardStore } from "../store/file-guard-store.js";
import { normalizePath } from "../gate/path-extractor.js";
import type { CommandContext, CommandResult } from "./types.js";

export function handleProtect(
  ctx: CommandContext,
  deps: { store: FileGuardStore },
): CommandResult {
  const path = ctx.args.trim();
  if (!path) {
    return { text: "Usage: /protect <path>" };
  }

  const normalized = normalizePath(path);
  if (!normalized) {
    return { text: `Invalid path: ${path}` };
  }

  const existing = deps.store.getProtection(ctx.agentId, normalized);
  if (existing) {
    return {
      text:
        existing.owner_user_id === ctx.userId
          ? `You already own ${normalized}.`
          : `${normalized} is already protected by ${existing.owner_user_id}.`,
    };
  }

  deps.store.protectFile({
    agentId: ctx.agentId,
    filePath: normalized,
    ownerUserId: ctx.userId,
  });

  deps.store.logAudit({
    agentId: ctx.agentId,
    action: "protect",
    targetPath: normalized,
    actorUserId: ctx.userId,
  });

  return { text: `Protected ${normalized}. Only you can edit it now.` };
}
