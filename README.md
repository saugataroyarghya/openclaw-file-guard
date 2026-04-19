# openclaw-file-guard

Per-user file ownership and access control middleware for [OpenClaw](https://docs.openclaw.ai).

Companion to [openclaw-credential-vault](https://github.com/saugataroyarghya/openclaw-tools-middleware) — same middleware pattern, different domain.

## What it does

Protects sensitive files (`AGENTS.md`, `MEMORY.md`, skills, cron jobs, anything in your workspace) from being edited by chat users who don't have permission.

When a chat user asks the agent to edit a protected file, a `before_tool_call` hook intercepts the call and blocks it unless the requester is the owner or has been granted access. The AI never bypasses it because the hook runs in the gateway, before the tool executes.

```
User: "Edit AGENTS.md to add a new instruction"
  ↓
AI calls: edit({ file_path: "~/.openclaw/AGENTS.md", ... })
  ↓
file-guard hook fires:
  - Extract path from params
  - Look up protection for this path
  - Check if requester is owner or grantee
  - If not: BLOCK with explanation
  ↓
AI responds: "Access denied: AGENTS.md is protected. Owner: slack:U_SAUGATA.
              Ask the owner to grant you access with /grant @you ..."
```

## Why you need this

Without this plugin, anyone who can chat with your OpenClaw bot can ask the AI to modify any file the bot has access to. Your skills, your memory, your config — all editable by anyone in the conversation. There's no built-in OpenClaw mechanism to say "this skill belongs to Alice, only she can change it." This plugin fills that gap.

## Architecture

Pure middleware. **No tools registered.** Only:

- `before_tool_call` hook — intercepts `write`, `edit`, `apply_patch`, `exec`, `process`
- Path extractor — parses target paths from each tool's params (including unified diff headers and shell command scanning)
- Path matcher — supports exact paths and glob patterns (via `minimatch`)
- SQLite store — tracks `protected_files`, `file_grants`, `audit_log`
- Channel-scoped user identity — user keys are stored as `channel:senderId` to prevent cross-channel impersonation
- Mention parser — accepts `@bob`, `<@U_BOB>`, or raw `slack:U_BOB` in commands

## Commands

| Command | Purpose | Owner-only |
|---|---|---|
| `/protect <path>` | Claim ownership of a file | No |
| `/unprotect <path>` | Remove protection | Yes |
| `/grant <user> <path> [permission]` | Grant edit access | Yes |
| `/revoke <user> <path>` | Revoke access | Yes |
| `/protected` | List files you own and have access to | No |

`<user>` accepts:
- `@username` — bare mention (Telegram-style or auto-converted by other channels)
- `<@U_BOB>` — Slack-style auto-mention (Slack converts `@bob` to this in raw text)
- `<@123456789>` / `<@!123456789>` — Discord-style mention
- `slack:U_BOB` — explicit channel-scoped key (always works)

## How user identity works

The plugin reads `requesterSenderId` and `messageChannel` from OpenClaw's runtime context. These are set by the chat platform's authenticated payload — the AI cannot fake them. User keys are stored as `channel:senderId`:

```
Slack user U_BOB    → slack:U_BOB
Discord user 12345  → discord:12345
WhatsApp +880...    → whatsapp:+880...
```

This means:
- A Slack user and a Discord user with the same handle are different identities
- Someone can't spoof your Slack ID from another channel — the channel prefix won't match
- Identity is provided by the platform, not chosen by the user or the AI

## Config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "load": { "paths": ["/path/to/openclaw-file-guard"] },
    "allow": ["file-guard"],
    "entries": {
      "file-guard": {
        "enabled": true,
        "config": {
          "watchedPaths": [
            "~/.openclaw/**/*.md",
            "~/.openclaw/workspace/**",
            "~/.openclaw/openclaw.json"
          ],
          "alwaysProtected": [
            {
              "path": "~/.openclaw/openclaw.json",
              "ownerUserId": "slack:U_ADMIN"
            },
            {
              "path": "~/.openclaw/AGENTS.md",
              "ownerUserId": "slack:U_ADMIN",
              "grantees": ["slack:U_LEAD"]
            }
          ]
        }
      }
    }
  }
}
```

### Config fields

- **`watchedPaths`** — Glob patterns defining the scope of files this plugin can guard. Files outside these patterns are unprotected. If omitted, all paths are watched (slower but safer default).
- **`alwaysProtected`** — Admin-pinned protections seeded on plugin startup. Each entry locks a path under a specific owner without requiring a runtime `/protect` command. Optional `grantees` array pre-grants edit access to specific users.

## Install

```bash
git clone https://github.com/saugataroyarghya/openclaw-file-guard.git
cd openclaw-file-guard
npm install
npm run build
```

Add the config to `~/.openclaw/openclaw.json`, then restart OpenClaw:

```bash
openclaw gateway restart
```

## Example flows

**Owner editing their own file:**
```
Saugata: "Edit AGENTS.md to add a new instruction"
AI:      [calls edit, hook checks ownership, allows]
AI:      "Done — added the new instruction to AGENTS.md."
```

**Non-owner without grant:**
```
Bob:     "Edit AGENTS.md to add a new instruction"
AI:      [calls edit, hook checks, blocks]
AI:      "Access denied: AGENTS.md is protected. Owner: slack:U_SAUGATA.
          Ask the owner to grant you access with
          /grant slack:U_BOB ~/.openclaw/AGENTS.md"
```

**Owner grants access via @mention:**
```
Saugata: /grant @bob ~/.openclaw/AGENTS.md
Bot:     "Granted edit access to slack:U_BOB on /Users/sa/.openclaw/AGENTS.md."

Bob:     "Edit AGENTS.md to add a new instruction"
AI:      [calls edit, hook checks, finds Bob has a grant, allows]
AI:      "Done — added the new instruction to AGENTS.md."
```

## Database

SQLite at `~/.openclaw/file-guard/file-guard.db`. Three tables:

- **`protected_files`** — `(agent_id, file_path, owner_user_id, protected_at)`
- **`file_grants`** — `(agent_id, file_path, grantee_user_id, granted_by, permission, granted_at)`
- **`audit_log`** — every protect, unprotect, grant, revoke, and block, with timestamp + actor + tool name

Query the audit log to see who tried to edit what:

```bash
sqlite3 ~/.openclaw/file-guard/file-guard.db \
  "SELECT datetime(timestamp/1000, 'unixepoch'), action, actor_user_id, target_path, tool_name FROM audit_log ORDER BY timestamp DESC LIMIT 20"
```

## What it doesn't do

This plugin is **defense in depth**, not a security boundary.

- **Not OS-level enforcement.** The OpenClaw process can still read/write any file it has filesystem permissions for. This plugin blocks the AI from doing edits via tool calls. For OS-level enforcement, run OpenClaw as a dedicated user and use `chmod`/`chown` on protected files.
- **Not encryption.** Files aren't encrypted at rest. The plugin tracks ownership metadata only.
- **Not read protection.** Anyone can still `read` or `cat` a protected file. The plugin only gates *write* operations.
- **Not anti-jailbreak for arbitrary `exec`.** A determined AI could try clever shell tricks (base64-encoded commands, indirect file paths via variables). Our scanner catches obvious cases. For real protection against this, OpenClaw's sandboxed exec mode prevents the AI from accessing the filesystem at all when running under the sandbox.

The right model: this plugin + OS permissions + sandboxed exec = layered protection.

## Comparison to credential-vault

| Aspect | credential-vault | file-guard |
|---|---|---|
| Domain | API authentication | File access control |
| Hook | `before_tool_call` (gate + inject) | `before_tool_call` (gate only) |
| Storage | Encrypted credentials (AES-GCM) | Ownership metadata (plaintext) |
| Tools registered | `vault_fetch` | None |
| Commands | `/connect`, `/disconnect`, `/connections` | `/protect`, `/unprotect`, `/grant`, `/revoke`, `/protected` |
| User identity | `channel:senderId` (anti-spoofing) | `channel:senderId` (anti-spoofing) |

You can run them together. They don't conflict.

## License

MIT
