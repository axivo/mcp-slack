# Slack MCP Server

A Slack MCP (Model Context Protocol) server that provides 9 core Slack tools for Claude.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": [
        "-y"
        "@axivo/mcp-slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_CHANNEL_IDS": "C01234567, C76543210",
        "SLACK_TEAM_ID": "T01234567"
      }
    }
  }
}
```

## Setup

1. Create a Slack App:
   - Visit the [Slack Apps page](https://api.slack.com/apps)
   - Click "Create New App"
   - Choose "From scratch"
   - Name your app and select your workspace

2. Configure Bot Token Scopes:
   Navigate to "OAuth & Permissions" and add these scopes:
   - `channels:history` - View messages and other content in public channels
   - `channels:read` - View basic channel information
   - `chat:write` - Send messages as the app
   - `reactions:write` - Add emoji reactions to messages
   - `users:read` - View users and their basic information
   - `users.profile:read` - View detailed profiles about users

4. Install App to Workspace:
   - Click "Install to Workspace" and authorize the app
   - Save the "Bot User OAuth Token" that starts with `xoxb-`

## Available Tools

- `slack_add_reaction` - Add emoji reactions
- `slack_edit_message` - Edit existing messages
- `slack_get_channel_history` - Get channel message history
- `slack_get_thread_replies` - Get thread replies
- `slack_get_user_profile` - Get user profile information
- `slack_get_users` - List workspace users
- `slack_list_channels` - List workspace channels
- `slack_post_message` - Post messages to channels
- `slack_reply_to_thread` - Reply to message threads

## License

BSD 3-Clause License
