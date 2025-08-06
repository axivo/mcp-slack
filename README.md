# Slack MCP Server

A Slack MCP (Model Context Protocol) server that provides 8 core Slack tools for Claude.

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
        "SLACK_BOT_TOKEN": "xoxb-token",
        "SLACK_TEAM_ID": "T048"
      }
    }
  }
}
```

## Required Slack App Permissions

```
channels:read
chat:write
users:read
reactions:write
```

## Available Tools

- `slack_list_channels` - List workspace channels
- `slack_post_message` - Post messages to channels  
- `slack_reply_to_thread` - Reply to message threads
- `slack_add_reaction` - Add emoji reactions
- `slack_get_channel_history` - Get channel message history
- `slack_get_thread_replies` - Get thread replies
- `slack_get_users` - List workspace users
- `slack_get_user_profile` - Get user profile information

## License

BSD 3-Clause License
