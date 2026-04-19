/**
 * openclaw-file-guard
 *
 * Pure middleware plugin for OpenClaw.
 *
 * Per-user file ownership and access control:
 *   - Owner declares ownership via /protect <path>
 *   - Owner grants/revokes edit access to other users
 *   - before_tool_call hook intercepts write/edit/apply_patch/exec calls
 *     and blocks them if the requester isn't the owner or a grantee
 *
 * Provides:
 *   - /protect, /unprotect, /grant, /revoke, /protected commands
 *   - alwaysProtected config for admin-pinned protections
 *   - Audit log of all enforcement actions
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { FileGuardStore } from "./src/store/file-guard-store.js";
import {
  checkPermission,
  parseSessionKey,
  userKeyOf,
  normalizePath,
} from "./src/gate/index.js";
import {
  handleProtect,
  handleUnprotect,
  handleGrant,
  handleRevoke,
  handleProtected,
} from "./src/commands/index.js";
import type { FileGuardPluginConfig } from "./src/types.js";
import { DB_FILENAME, DEFAULT_PERMISSION } from "./src/constants.js";

function getStateDir(): string {
  return process.env.OPENCLAW_HOME || process.env.MOLTBOT_HOME || join(homedir(), ".openclaw");
}

function buildCommandCtx(rawCtx: any) {
  const channel = rawCtx.channel ?? rawCtx.channelId ?? "unknown";
  const sender = rawCtx.senderId ?? rawCtx.from ?? "";
  const userId = `${channel}:${sender}`;

  let agentId = rawCtx.agentId;
  if (!agentId) {
    const sk = rawCtx.sessionKey ?? "";
    const parts = sk.split(":");
    agentId = parts[0] === "agent" && parts[1] ? parts[1] : (rawCtx.accountId ?? "main");
  }

  return {
    args: rawCtx.args ?? rawCtx.commandBody ?? "",
    agentId,
    userId,
    channelId: channel,
  };
}

const plugin = {
  id: "file-guard",
  name: "File Guard",
  description:
    "Per-user file ownership and access control middleware for OpenClaw.",

  register(api: any) {
    const config = (api.pluginConfig ?? {}) as FileGuardPluginConfig;
    const log = api.logger?.info?.bind(api.logger) ?? console.log;

    // 1. Initialize store
    const stateDir = getStateDir();
    const dbPath = join(stateDir, "file-guard", DB_FILENAME);
    const store = new FileGuardStore({ dbPath });

    log("[file-guard] Initialized store");

    // 2. Seed always-protected entries from config
    if (config.alwaysProtected && config.alwaysProtected.length > 0) {
      const defaultAgentId = "main";
      for (const entry of config.alwaysProtected) {
        const normalized = normalizePath(entry.path);
        if (!normalized) {
          log(`[file-guard] Skipping invalid alwaysProtected path: ${entry.path}`);
          continue;
        }
        store.protectFile({
          agentId: defaultAgentId,
          filePath: normalized,
          ownerUserId: entry.ownerUserId,
        });
        if (entry.grantees) {
          for (const grantee of entry.grantees) {
            store.grantAccess({
              agentId: defaultAgentId,
              filePath: normalized,
              granteeUserId: grantee,
              grantedBy: entry.ownerUserId,
              permission: DEFAULT_PERMISSION,
            });
          }
        }
      }
      log(`[file-guard] Seeded ${config.alwaysProtected.length} always-protected entries`);
    }

    // 3. The gate hook — intercepts write/edit/apply_patch/exec calls
    api.on("before_tool_call", (event: any, ctx: any) => {
      const identity = parseSessionKey(ctx.sessionKey ?? "");
      if (!identity) return undefined;

      const decision = checkPermission({
        toolName: event.toolName ?? ctx.toolName,
        toolParams: event.params,
        identity,
        agentId: ctx.agentId ?? "",
        store,
        config,
      });

      if (!decision.allowed) {
        store.logAudit({
          agentId: ctx.agentId ?? "",
          action: "block",
          actorUserId: userKeyOf(identity),
          toolName: event.toolName ?? ctx.toolName,
          metadata: JSON.stringify({ reason: decision.reason }),
        });
        return { block: true, blockReason: decision.reason };
      }

      return undefined;
    });

    // 4. Commands
    api.registerCommand({
      name: "protect",
      description: "Claim ownership of a file so only you (and grantees) can edit it",
      acceptsArgs: true,
      requireAuth: false,
      handler: (ctx: any) => handleProtect(buildCommandCtx(ctx), { store }),
    });

    api.registerCommand({
      name: "unprotect",
      description: "Remove protection from a file you own",
      acceptsArgs: true,
      requireAuth: false,
      handler: (ctx: any) => handleUnprotect(buildCommandCtx(ctx), { store }),
    });

    api.registerCommand({
      name: "grant",
      description: "Grant another user edit access to a file you own",
      acceptsArgs: true,
      requireAuth: false,
      handler: (ctx: any) => handleGrant(buildCommandCtx(ctx), { store }),
    });

    api.registerCommand({
      name: "revoke",
      description: "Revoke a user's edit access to a file you own",
      acceptsArgs: true,
      requireAuth: false,
      handler: (ctx: any) => handleRevoke(buildCommandCtx(ctx), { store }),
    });

    api.registerCommand({
      name: "protected",
      description: "List files you own and have access to",
      acceptsArgs: false,
      requireAuth: false,
      handler: (ctx: any) => handleProtected(buildCommandCtx(ctx), { store }),
    });

    log("[file-guard] Plugin registered successfully");
  },
};

export default plugin;
