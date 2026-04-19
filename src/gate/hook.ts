import type { FileGuardStore } from "../store/file-guard-store.js";
import type {
  FileGuardPluginConfig,
  PermissionDecision,
  UserIdentity,
} from "../types.js";
import { GATED_TOOLS } from "../constants.js";
import { extractPaths } from "./path-extractor.js";
import { findMatchingProtection, isWatched } from "./path-matcher.js";

/**
 * Decide whether a tool call should be allowed for the given user.
 * Returns { allowed: false, reason } to block; { allowed: true } to permit.
 */
export function checkPermission(params: {
  toolName: string;
  toolParams: any;
  identity: UserIdentity;
  agentId: string;
  store: FileGuardStore;
  config: FileGuardPluginConfig;
}): PermissionDecision {
  const { toolName, toolParams, identity, agentId, store, config } = params;

  if (!GATED_TOOLS.has(toolName)) return { allowed: true };

  const paths = extractPaths(toolName, toolParams);
  if (paths.length === 0) return { allowed: true };

  const userKey = `${identity.channel}:${identity.userId}`;
  const allProtections = store.listAllProtections(agentId);

  for (const path of paths) {
    if (!isWatched(path, config.watchedPaths)) continue;

    const protection = findMatchingProtection(path, allProtections);
    if (!protection) continue;

    if (protection.owner_user_id === userKey) continue;

    // Check grants
    const grant = store.hasGrant(agentId, protection.file_path, userKey);
    if (grant) continue;

    return {
      allowed: false,
      reason:
        `Access denied: ${path} is protected. ` +
        `Owner: ${protection.owner_user_id}. ` +
        `Ask the owner to grant you access with /grant ${userKey} ${protection.file_path}`,
    };
  }

  return { allowed: true };
}

/**
 * Parse a session key into user identity.
 * Supports OpenClaw format: agent:<id>:<channel>:direct:<userId>
 * Falls back to channel:userId for simpler formats.
 */
export function parseSessionKey(sessionKey: string): UserIdentity | null {
  if (!sessionKey) return null;
  const parts = sessionKey.split(":");

  // Format: agent:main:slack:direct:U12345
  if (parts[0] === "agent" && parts.length >= 5) {
    return { channel: parts[2], userId: parts[parts.length - 1] };
  }

  // Format: agent:main:slack:U12345 (no kind)
  if (parts[0] === "agent" && parts.length >= 4) {
    return { channel: parts[2], userId: parts[parts.length - 1] };
  }

  // Format: channel:userId
  if (parts.length >= 2) {
    return { channel: parts[0], userId: parts[parts.length - 1] };
  }

  return null;
}

/**
 * Build a channel-scoped user key from a UserIdentity.
 */
export function userKeyOf(identity: UserIdentity): string {
  return `${identity.channel}:${identity.userId}`;
}
