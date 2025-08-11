# Slack MCP Server

A Slack MCP (Model Context Protocol) server that provides 9 Slack tools for Claude.

### Setup

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

### MCP Server

Add to your `mcp.json` servers configuration:

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
        "SLACK_CHANNEL_IDS": "C01234567, C76543210",
        "SLACK_SUSPICIOUS_DOMAINS": "bit.ly, goo.gl, ngrok.io"
      }
    }
  }
}
```

### Environment Variables

#### Required

- `SLACK_BOT_TOKEN` - Your Slack bot token (starts with `xoxb-`)
- `SLACK_TEAM_ID` - Your Slack workspace/team ID (starts with `T`)

#### Optional

- `SLACK_CHANNEL_IDS` - Comma-separated list of channel IDs to restrict access to specific channels only. If not provided, the server can access all public channels the bot has permissions for.
- `SLACK_SUSPICIOUS_DOMAINS` - Comma-separated list of domains to block for security. If not provided, defaults to blocking known URL shorteners: `bit.ly, goo.gl, ngrok.com, ngrok.io, tinyurl.com`. Set to empty string to disable domain blocking.

### Security Features

- **GitHub Markdown Conversion**: Automatically converts GitHub Flavored Markdown to Slack mrkdwn format
- **URL Validation**: Blocks suspicious domains and non-standard ports to prevent data exfiltration
- **Link Unfurling Disabled**: Prevents automatic link crawling that could leak sensitive information
- **Content Sanitization**: Removes malicious scripts and validates all user input
- **Rate Limiting**: Enforces 60 requests per minute per endpoint

### Tools

1. `slack_add_reaction`
   - Add a reaction emoji to a message
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the message
     - `timestamp` (string): The timestamp of the message to react to
     - `reaction` (string): The name of the emoji reaction (without ::)
   - Returns: Reaction addition confirmation

2. `slack_edit_message`
   - Edit an existing message in a Slack channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the message
     - `timestamp` (string): The timestamp of the message to edit
     - `text` (string): The message text to edit
   - Returns: Message edit confirmation with updated content

3. `slack_get_channel_history`
   - Get recent messages from a channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel
   - Optional inputs:
     - `limit` (number, default: 10): Number of messages to retrieve
   - Returns: Array of recent messages with metadata

4. `slack_get_thread_replies`
   - Get all replies in a message thread
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the thread
     - `thread_ts` (string): The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it
   - Returns: Array of thread replies with message details

5. `slack_get_user_profile`
   - Get detailed profile information for a specific user
   - Required inputs:
     - `user_id` (string): The ID of the user
   - Returns: Detailed user profile information including display name, status, timezone, etc.

6. `slack_get_users`
   - Get a list of all users in the workspace with their basic profile information
   - Optional inputs:
     - `limit` (number, default: 100, max: 200): Maximum number of users to return
     - `cursor` (string): Pagination cursor for next page of results
   - Returns: List of workspace users with basic profile information

7. `slack_list_channels`
   - List public or pre-defined channels in the workspace with pagination
   - Optional inputs:
     - `limit` (number, default: 100, max: 200): Maximum number of channels to return
     - `cursor` (string): Pagination cursor for next page of results
   - Returns: List of channels with their IDs and information

8. `slack_post_message`
   - Post a new message to a Slack channel
   - Required inputs:
     - `channel_id` (string): The ID of the channel to post to
     - `text` (string): The message text to post
   - Returns: Message posting confirmation with timestamp and channel info

9. `slack_reply_to_thread`
   - Reply to a specific message thread in Slack
   - Required inputs:
     - `channel_id` (string): The ID of the channel containing the thread
     - `thread_ts` (string): The timestamp of the parent message in the format '1234567890.123456'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it
     - `text` (string): The reply text to post
   - Optional inputs:
     - `broadcast` (boolean, default: false): Whether to also send the reply to the main channel
   - Returns: Thread reply confirmation with message details
