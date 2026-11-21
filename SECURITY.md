# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a Vulnerability

To report a security vulnerability, please use [GitHub's private vulnerability reporting](https://github.com/axivo/mcp-slack/security/advisories/new).

Do not open a public issue for security vulnerabilities. You can expect an initial response within 48 hours and a resolution or status update within 7 days.

## Scope and Security Considerations

This package is an MCP server that calls the [Slack Web API](https://api.slack.com/web) over HTTPS with a bot token. It needs no browser and no special system permission. It does not execute commands, does not write files, and sends requests only to `slack.com`.

The following threat vectors are in scope:

- Arbitrary code execution through MCP tool inputs
- Requests sent to hosts other than `slack.com`
- Disclosure of the bot token in tool output, logs or errors
- Messages posted, edited or reacted to outside the tool call that asked for it
- Supply chain compromise of published npm artifacts

### Bot Token

The bot token is read from the `SLACK_BOT_TOKEN` environment variable at startup and sent only as a bearer token in the `Authorization` header of requests to `slack.com`. It is never returned in tool output or included in error messages. The token's scopes decide what the server can do, so grant only the scopes listed in the README. Anyone who can read the MCP client configuration can read the token.

### Data Sent to Slack

Each tool call sends its inputs to the matching Slack Web API method, for example the channel id and text for `post_message`. Text is converted from Markdown to Slack formatting before it is sent, with link and media unfurling disabled. Messages posted through the server are stored by Slack and visible to everyone in the channel. The `status` tool calls `auth.test` and sends no user data.

### Limits

Every request has a 10 second timeout and stops when the MCP client cancels the tool call. Each Slack method is limited to 60 requests per minute. Slack errors and HTTP errors are returned as tool errors with the Slack error code, never as successful results.

### Transport Authentication

The MCP server communicates over stdio transport, it is spawned as a child process by the MCP client, not a listening socket. There is no authentication layer between the client and server. Whoever controls the MCP client configuration controls the server entirely, which here means posting and reading in the workspace as the bot. Security depends on restricting write access to the MCP client configuration and trusting the MCP client (e.g., Claude Desktop, Claude Code) to enforce tool call boundaries.

## Supply Chain Integrity

All releases are published to npm using [trusted publishing](https://docs.npmjs.com/generating-provenance-statements) with npm provenance attestation enabled. Each published version is cryptographically linked to a specific GitHub Actions workflow run and commit.

To verify the integrity of an installed version, run:

```bash
npm audit signatures @axivo/mcp-slack
```
