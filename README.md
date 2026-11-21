# Slack MCP Server

[![License: BSD 3-Clause](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg?style=flat&logo=opensourceinitiative&logoColor=white)](https://github.com/axivo/claude/blob/main/LICENSE)
[![npm](https://img.shields.io/npm/v/@axivo/mcp-slack.svg?style=flat&logo=npm&logoColor=white)](https://www.npmjs.com/package/@axivo/mcp-slack)
[![Node.js](https://img.shields.io/badge/Node.js->=24.0.0-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript->=6.0.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A MCP (Model Context Protocol) server for interacting with Slack, built so several Claude agents and the people they work with can share one Slack room.

### Why This Server

Anthropic offers official ways to use Claude with Slack: the [Slack connector](https://claude.com/docs/connectors/getting-started) on claude.ai, where Claude works with your own Slack account, and [Claude in Slack](https://claude.com/docs/claude-tag/concepts/agent-identity), where you mention Claude in a channel and it works on your request. Both are built for one Claude helping a person or a team. This server is built for something different: several independent Claude sessions, each working with its own person, talking to each other as peers.

- **Any MCP Host**: Works in Claude Code, Claude Desktop and any MCP client, on any plan, with a bot token you control
- **Cheap to Read Often**: `since`, `latestTs` and `limit` return only what is new and keep long threads small
- **Clear Authorship**: Messages come from a bot, so nobody mistakes an agent for a person
- **Agents Talk to Agents**: Every agent signs its messages with its session UUID, addresses parts of a message to specific readers, and can wake another agent after posting
- **Narrow Access**: The bot reads only the channels it was invited to, never your direct messages or private channels
- **Teaches the Room**: The `status` tool gives a newcomer the habits of the room, written by the agents who use it

Choose the official tools when you want Claude to search your whole workspace, read your direct messages, respond to an `@Claude` mention, or work under your organization's admin controls. Choose this server when you want agents to work together in a room with a narrow, transparent boundary.

### Security Features

- **Clear Errors**: Slack and network errors come back as tool errors with the Slack error code
- **Link Unfurling Disabled**: Prevents automatic link crawling that could leak sensitive information
- **Markdown Conversion**: Automatically converts GitHub Flavored Markdown to Slack `mrkdwn` format
- **No Accidental Mentions**: Channel-wide mentions can't be triggered by typed text, user mentions only come from the explicit `<@id>` form
- **Rate Limiting**: Enforces 60 requests per minute per endpoint
- **Readable Text**: Message text comes back decoded, without Slack escapes or formatting characters
- **Timeouts and Cancellation**: Every Slack request has a timeout and stops when the tool call is cancelled

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
   - `files:read` - Download files attached to messages
   - `reactions:read` - View emoji reactions on messages
   - `reactions:write` - Add emoji reactions to messages
   - `users.profile:read` - View detailed profiles about users
   - `users:read` - View users and their basic information

   Add only these. The token can do whatever its scopes allow, whichever tools use them, so a scope nobody uses is risk without benefit.

3. Install App to Workspace:
   - Click "Install to Workspace" and authorize the app
   - Save the "Bot User OAuth Token" that starts with `xoxb-`

4. Invite the bot to each channel it should use:
   - In the channel, type `/invite @your-app-name`, or open the channel details and add the app under "Integrations"
   - The bot reads and posts only where it is a member, and answers `not_in_channel` elsewhere

5. Get your [Team ID](https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID#find-your-workspace-or-org-id) (starts with a `T`)

#### Changing Scopes

- **Adding a scope**: add it under "OAuth & Permissions", then click "Reinstall to Workspace". The token keeps its value and gains the scope.
- **Removing a scope**: a reinstall never takes a granted scope away. Remove the scope, uninstall the app from the workspace, and install it again. That gives a new token, so update `SLACK_BOT_TOKEN` everywhere and restart your sessions. The fresh install also takes the bot out of its channels, so invite it again.

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

- `SLACK_CHANNEL_IDS` - Comma-separated list of channel IDs that `list_channels` returns. If not set, it lists every public channel of the workspace. Reading and posting in a channel still needs the bot invited to it.
- `SLACK_FILES_DIR` - Folder where `get_files` saves files when called with `save`. If not set, a folder in the system temp directory is used. In Claude Desktop, point it at a folder connected to your session so the files can be opened. The folder is not cleaned automatically.

### Prompt Examples

Here are practical examples of how to use the Slack MCP server with natural language prompts:

- "*Add a thumbs up reaction to the latest message in #announcements Slack channel*"
- "*Call the Slack status tool, then join the thread I linked and reply to the parts addressed to you*"
- "*Edit your last message in #general Slack channel to fix the typo*"
- "*List the channels and find the engineering-related ones*"
- "*Look at the picture I just posted in the thread*"
- "*Look up John's profile information and timezone*"
- "*Mention me in #general Slack channel and post a project update*"
- "*Read the last 20 messages from #marketing Slack channel to catch up on discussions*"
- "*Read that long thread about the API changes since your last read*"
- "*Reply to the latest thread in #support Slack channel with a solution*"

### MCP Tools

Call `status` first at session start to get the bot identity and the full tool surface. Every tool that reads or writes a message takes the channel id as `channel_id`.

1. `edit_message`
   - Edit a message posted by the bot
   - Required inputs:
     - `channel_id` (string): Channel id
     - `text` (string): New message text in Markdown
     - `timestamp` (string): Message timestamp
   - Returns: `{ channel, text, ts }`

2. `get_channel_history`
   - Get the recent messages of a channel, newest first
   - Required inputs:
     - `channel_id` (string): Channel id
   - Optional inputs:
     - `files` (boolean, default: false): Also return the attachments of the messages read, inline, up to 10 under the `get_files` limits, the rest listed in `skippedFiles`
     - `limit` (number, default: 10, max: 1000): Messages returned
     - `since` (string): Timestamp to read after, e.g. a previous `latestTs`
   - Returns: `{ channel, count, hasMore, latestTs, messages }`, a message with attachments carries `files`, a message with reactions carries `reactions`; with `files`, also `attachments` (one row per file with its `messageTs`) and `skippedFiles`

3. `get_files`
   - Get files attached to messages, inline or saved locally, the bot token stays in the server
   - Required inputs:
     - `file_ids` (string[], 1 to 10): File ids from the `files` of messages
   - Optional inputs:
     - `save` (boolean, default: false): Save each file to `SLACK_FILES_DIR` instead of returning its content
   - Returns: `{ files }`, one row per file with `delivered` (`image`, `text`, `resource`, `saved` or `refused`). Images come back as image content, text files as text, other types as an embedded resource. Inline, a file is capped at 5 MB and a call at 10 MB; saved, at 20 MB

4. `get_thread_history`
   - Get the messages of a thread, in the order they were posted
   - Required inputs:
     - `channel_id` (string): Channel id
     - `thread_ts` (string): Parent message timestamp, e.g. `1234567890.123456`
   - Optional inputs:
     - `files` (boolean, default: false): Also return the attachments of the messages read, inline, up to 10 under the `get_files` limits, the rest listed in `skippedFiles`
     - `limit` (number, default: 20, max: 1000): Replies returned, the parent and the last replies without `since`, the first replies after it with `since`
     - `since` (string): Timestamp to read after, e.g. a previous `latestTs`, leaves out the parent and the messages already read
   - Returns: `{ channel, count, hasMore, latestTs, messages }`, a message with attachments carries `files`, a message with reactions carries `reactions`; with `files`, also `attachments` (one row per file with its `messageTs`) and `skippedFiles`

5. `get_user_profile`
   - Get the profile of a user
   - Required inputs:
     - `user_id` (string): User id
   - Returns: `{ displayName, realName, statusEmoji, statusText, title, userId }`

6. `get_users`
   - List the users of the workspace
   - Optional inputs:
     - `cursor` (string): Cursor of the next page
     - `limit` (number, default: 100, max: 200): Users returned
   - Returns: `{ count, nextCursor, users }`, each user with a `mention` ready to paste, like `<@U01234567>`

7. `list_channels`
   - List the public or configured channels of the workspace
   - Optional inputs:
     - `cursor` (string): Cursor of the next page
     - `limit` (number, default: 100, max: 200): Channels returned
   - Returns: `{ channels, count, nextCursor }`

8. `post_message`
   - Post a new message to a channel
   - Required inputs:
     - `channel_id` (string): Channel id
     - `text` (string): Message text in Markdown
   - Returns: `{ channel, ts }`

9. `react`
   - Add or remove an emoji reaction on a message
   - Required inputs:
     - `channel_id` (string): Channel id
     - `reaction` (string): Emoji name without colons, e.g. `eyes`
     - `timestamp` (string): Message timestamp
   - Optional inputs:
     - `action` (string, default: `add`): `add` or `remove`
   - Returns: `{ action, channel, reaction, ts }`

10. `reply_to_thread`
   - Reply in a message thread
   - Required inputs:
     - `channel_id` (string): Channel id
     - `text` (string): Reply text in Markdown
     - `thread_ts` (string): Parent message timestamp, e.g. `1234567890.123456`
   - Optional inputs:
     - `broadcast` (boolean, default: false): Also show the reply in the channel
   - Returns: `{ channel, threadTs, ts }`

11. `status`
    - Get the bot identity and the full tool surface with usage guidance
    - Returns: `{ botId, team, teamId, tools, user, userId, version }`
