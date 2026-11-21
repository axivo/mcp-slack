# Changelog

All notable changes to the Slack MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-11-17

### Added

- Field `files` on messages with attachments, with each file's `id`, `mimetype`, `name` and `size`
- Field `reactions` on messages with reactions, with each emoji `name`, its `count` and the `users` who added it, so an acknowledgment like 👀 or ✅ is visible in a read
- Output schemas on every tool, results returned as structured content
- Parameter `files` on `get_channel_history` and `get_thread_history`, off by default, returning the attachments of the messages read inline under the `get_files` limits
- Parameter `limit` on `get_thread_history`, default 20, returning the parent and the last replies on a first read, or the first replies after `since`, so a long thread never floods the reader
- Parameter `since` on `get_channel_history` and `get_thread_history`, returning only the messages after a timestamp, and field `latestTs` with the newest timestamp to read after next time
- Request timeout and cancellation, a cancelled tool call stops its Slack request
- Tool `get_files` returning attachments inline, images as image content, text as text, other types as an embedded resource, or saved by file id in `SLACK_FILES_DIR` with `save`; the bot token is sent only to `files.slack.com`, redirects are checked hop by hop, and size is capped per file and per call
- Tool `react` adding or removing a reaction
- Tool `status` returning the bot identity, workspace, server version and the full tool surface with usage guidance
- Tool annotations telling read tools from write tools
- Usage guidance on every tool, and in `status` the habits of a shared room grouped by family (`Nudge:`, `Read:`, `Remind:`, `Room:`, `Sign:`, `Write:`), written and reviewed by the agents who use it

### Changed

- Dependency `slackify-markdown` updated to 5.0.0, ESM with its own types, strips HTML comments, fixes multiline blockquotes
- Input schemas written in Zod, arguments validated by the SDK before a handler runs
- Migrated to the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`), served with `serveStdio` for both the 2025-era and the 2026-07-28 protocol revisions
- Results carry the fields agents use, in camelCase, instead of the raw Slack payload
- Tool `add_reaction` replaced by `react`, emoji names keep `+` and `-`, so `+1` works
- Tool `get_thread_replies` renamed `get_thread_history`, to pair with `get_channel_history`, a session keeps the old name until its server restarts

### Fixed

- Markdown links render as links, `parse: 'full'` made Slack escape them into plain text
- Message text is returned readable, `&lt;`, `&gt;` and `&amp;` decoded and zero-width formatting spaces removed
- Messages no longer notify the whole channel by accident, `link_names` is off and channel-wide mention markup is escaped, the `mention` field uses the explicit `<@id>` form
- Network failures are returned as tool errors instead of unhandled rejections
- Rate limit cleanup no longer drops the counters of other endpoints
- Rate limit is enforced per endpoint, it was counted but never applied
- Slack errors (`ok: false`) and HTTP errors are returned as tool errors instead of successful results

## [1.0.4] - 2025-08-24

### Changed

- Code structure reorganized
- Prompt examples in the documentation

### Fixed

- Slack mentions understood by Claude

## [1.0.3] - 2025-08-20

### Changed

- Tools renamed without the `slack_` prefix
- Responses formatted the same way across tools
- Names linked natively by Slack with `link_names`

### Fixed

- Error handling

## [1.0.2] - 2025-08-13

### Added

- Markdown converted to Slack formatting with `slackify-markdown`

### Removed

- Content sanitization, messages are written by the peer
- Setting `SLACK_SUSPICIOUS_DOMAINS`

## [1.0.1] - 2025-08-12

### Fixed

- `bin` field in `package.json`, so the server runs with `npx`

## [1.0.0] - 2025-08-11

### Added

- Tools `slack_add_reaction`, `slack_edit_message`, `slack_get_channel_history`, `slack_get_thread_replies`, `slack_get_user_profile`, `slack_get_users`, `slack_list_channels`, `slack_post_message`, `slack_reply_to_thread`
- Content sanitization and URL validation
- Rate limit of 60 requests per minute per endpoint
- Markdown converted to Slack formatting
- Link unfurling disabled
