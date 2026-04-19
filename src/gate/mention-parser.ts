/**
 * Parse chat-platform-style user mentions into channel-scoped user keys.
 *
 * Supported formats:
 *   - Slack:    <@U12345>           → slack:U12345      (channel must be "slack")
 *   - Discord:  <@123456789>        → discord:123456789 (channel must be "discord")
 *   - Discord:  <@!123456789>       → discord:123456789 (nickname mention)
 *   - Telegram: @username           → telegram:username (channel must be "telegram")
 *   - Raw:     "channel:userId"     → passed through unchanged
 *
 * Returns the scoped key, or null if the identifier can't be parsed.
 */
export function resolveMention(
  identifier: string,
  currentChannel: string,
): string | null {
  if (!identifier) return null;
  const id = identifier.trim();
  if (!id) return null;

  // Already scoped: "channel:userId"
  if (id.includes(":") && !id.startsWith("<")) {
    return id;
  }

  // Slack / Discord angle-bracket mention: <@U12345>, <@!123456789>
  const angleMatch = id.match(/^<@!?([A-Za-z0-9_-]+)>$/);
  if (angleMatch) {
    const rawId = angleMatch[1];
    if (!currentChannel || currentChannel === "unknown") return null;
    return `${currentChannel}:${rawId}`;
  }

  // Bare @ mention: @username (Telegram, or plain)
  const atMatch = id.match(/^@([A-Za-z0-9_.-]+)$/);
  if (atMatch) {
    const rawId = atMatch[1];
    if (!currentChannel || currentChannel === "unknown") return null;
    return `${currentChannel}:${rawId}`;
  }

  return null;
}
