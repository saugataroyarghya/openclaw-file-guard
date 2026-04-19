import type { FileGuardStore } from "../store/file-guard-store.js";
import { normalizePath } from "../gate/path-extractor.js";
import { resolveMention } from "../gate/mention-parser.js";
import type { CommandContext, CommandResult } from "./types.js";

export function handleRevoke(
  ctx: CommandContext,
  deps: { store: FileGuardStore },
): CommandResult {
  const parts = ctx.args.trim().split(/\s+/);
  if (parts.length < 2) {
    return {
      text:
        "Usage: /revoke <user> <path>\n" +
        "Examples:\n" +
        "  /revoke @bob /path/to/file.md\n" +
        "  /revoke slack:U_BOB /path/to/file.md",
    };
  }

  const rawGrantee = parts[0];
  const rawPath = parts[1];

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
    return { text: `${normalized} is not protected.` };
  }

  if (protection.owner_user_id !== ctx.userId) {
    return {
      text: `Only the owner (${protection.owner_user_id}) can revoke access.`,
    };
  }

  const grant = deps.store.hasGrant(ctx.agentId, normalized, granteeUserId);
  if (!grant) {
    return { text: `${granteeUserId} has no grant for ${normalized}.` };
  }

  deps.store.revokeAccess(ctx.agentId, normalized, granteeUserId);

  deps.store.logAudit({
    agentId: ctx.agentId,
    action: "revoke",
    targetPath: normalized,
    actorUserId: ctx.userId,
    metadata: JSON.stringify({ grantee: granteeUserId }),
  });

  return { text: `Revoked access for ${granteeUserId} on ${normalized}.` };
}
