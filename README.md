# Slack MCP Server

[![License: BSD 3-Clause](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg?style=flat&logo=opensourceinitiative&logoColor=white)](https://github.com/axivo/claude/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js->=24.0.0-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript->=5.0.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A MCP (Model Context Protocol) server for interacting with Slack.

### Security Features

- **Markdown Conversion**: Automatically converts GitHub Flavored Markdown to Slack `mrkdwn` format
- **Link Unfurling Disabled**: Prevents automatic link crawling that could leak sensitive information
- **Rate Limiting**: Enforces 60 requests per minute per endpoint

### Slack Setup

1. Create a Slack App:
   - Visit the [Slack Apps](https://api.slack.com/apps)
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

3. Install App to Workspace:
   - Click "Install to Workspace" and authorize the app
   - Save the "Bot User OAuth Token" that starts with `xoxb-`

4. Get your [Team ID](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-workspace-or-org-id) (starts with a `T`)

### MCP Server Configuration

Add to `mcp.json` servers configuration:

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": [
        "-y",
        "@axivo/mcp-slack"
      ],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567",
        "SLACK_CHANNEL_IDS": "C01234567, C76543210"
      }
    }
  }
}
```

#### Environment Variables

Required variables:

- `SLACK_BOT_TOKEN` - Slack bot token (starts with `xoxb-`)
- `SLACK_TEAM_ID` - Slack [Team ID](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-workspace-or-org-id) (starts with `T`)

Optional variables:

- `SLACK_CHANNEL_IDS` - Comma-separated list of channel IDs to restrict access to specific channels only. If not set, the server can access all public channels the bot has permissions for.

### Tools

1. `add_reaction`
   - Add a reaction emoji to a message
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the message
     - `timestamp` (string): The timestamp of the message to react to
     - `reaction` (string): The name of the emoji reaction (without ::)
   - Returns: Reaction addition confirmation

2. `edit_message`
   - Edit an existing message in a Slack channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the message
     - `timestamp` (string): The timestamp of the message to edit
     - `text` (string): The message text to edit
   - Returns: Message edit confirmation with updated content

3. `get_channel_history`
   - Get recent messages from a channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel
   - Optional inputs:
     - `limit` (number, default: 10): Number of messages to retrieve
   - Returns: Array of recent messages with metadata

4. `get_thread_replies`
   - Get all replies in a message thread
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the thread
     - `thread_ts` (string): The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it
   - Returns: Array of thread replies with message details

5. `get_user_profile`
   - Get detailed profile information for a specific user
   - Required inputs:
     - `user_id` (string): The ID of the user
   - Returns: Detailed user profile information including display name, status, timezone, etc.

6. `get_users`
   - Get a list of all users in the workspace with their basic profile information
   - Optional inputs:
     - `limit` (number, default: 100, max: 200): Maximum number of users to return
     - `cursor` (string): Pagination cursor for next page of results
   - Returns: List of workspace users with basic profile information

7. `list_channels`
   - List public or pre-defined channels in the workspace with pagination
   - Optional inputs:
     - `limit` (number, default: 100, max: 200): Maximum number of channels to return
     - `cursor` (string): Pagination cursor for next page of results
   - Returns: List of channels with their IDs and information

8. `post_message`
   - Post a new message to a Slack channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel to post to
     - `text` (string): The message text to post
   - Returns: Message posting confirmation with timestamp and channel info

9. `reply_to_thread`
   - Reply to a specific message thread in Slack
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the thread
     - `thread_ts` (string): The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it
     - `text` (string): The reply text to post
   - Optional inputs:
     - `broadcast` (boolean, default: false): Whether to also send the reply to the main channel
   - Returns: Thread reply confirmation with message details
