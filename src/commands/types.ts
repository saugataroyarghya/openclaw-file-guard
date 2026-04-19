export type CommandContext = {
  args: string;
  agentId: string;
  userId: string;       // channel-scoped, e.g. "slack:U_AAA"
  channelId: string;    // raw channel name, e.g. "slack"
};

export type CommandResult = {
  text: string;
};
