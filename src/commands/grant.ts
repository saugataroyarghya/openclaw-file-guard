import type { FileGuardStore } from "../store/file-guard-store.js";
import { normalizePath } from "../gate/path-extractor.js";
import { resolveMention } from "../gate/mention-parser.js";
import { DEFAULT_PERMISSION } from "../constants.js";
import type { CommandContext, CommandResult } from "./types.js";

export function handleGrant(
  ctx: CommandContext,
  deps: { store: FileGuardStore },
): CommandResult {
  const parts = ctx.args.trim().split(/\s+/);
  if (parts.length < 2) {
    return {
      text:
        "Usage: /grant <user> <path> [permission]\n" +
        "Examples:\n" +
        "  /grant @bob /path/to/file.md\n" +
        "  /grant slack:U_BOB /path/to/file.md edit",
    };
  }

  const rawGrantee = parts[0];
  const rawPath = parts[1];
  const permission = parts[2] ?? DEFAULT_PERMISSION;

  // Resolve @mention or <@U123> into a channel-scoped user key
  const granteeUserId = resolveMention(rawGrantee, ctx.channelId);
  if (!granteeUserId) {
    return {
      text:
        `Could not resolve "${rawGrantee}" to a user. ` +
        `Use @username, <@U_BOB>, or a channel-scoped key like "slack:U_BOB".`,
    };
  }

  const normalized = normalizePath(rawPath);
  if (!normalized) {
    return { text: `Invalid path: ${rawPath}` };
  }

  const protection = deps.store.getProtection(ctx.agentId, normalized);
  if (!protection) {
    return {
      text: `${normalized} is not protected. Run /protect ${normalized} first.`,
    };
  }

  if (protection.owner_user_id !== ctx.userId) {
    return {
      text: `Only the owner (${protection.owner_user_id}) can grant access.`,
    };
  }

  deps.store.grantAccess({
    agentId: ctx.agentId,
    filePath: normalized,
    granteeUserId,
    grantedBy: ctx.userId,
    permission,
  });

  deps.store.logAudit({
    agentId: ctx.agentId,
    action: "grant",
    targetPath: normalized,
    actorUserId: ctx.userId,
    metadata: JSON.stringify({ grantee: granteeUserId, permission }),
  });

  return {
    text: `Granted ${permission} access to ${granteeUserId} on ${normalized}.`,
  };
}
