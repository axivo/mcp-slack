# Migration to MCP TypeScript SDK v2 — `mcp-slack` 1.1.0

Working document for the migration of `@axivo/mcp-slack` from the v1 SDK low-level `Server` to the v2 SDK `McpServer`, using the `mcp-flyer` design as the template. Read this first after a compaction.

## Tasks

Each task has sub tasks. Under a sub task, add what was found, any problem, and how it was fixed, so a later read shows the path and not only the result. Mark `[x]` when done. `← next` marks where to resume.

### 1. Analysis and plan

- [x] Compare `mcp-slack` with `mcp-flyer` and `mcp-claude-export`
  - Found: `mcp-slack` predates the template; low-level `Server`, hand JSON Schema, manual argument checks, `any`, errors returned as strings, no annotations, no usage, no `status`, no `CHANGELOG.md`
- [x] Check the SDK release lines
  - Found: v2 `2.4.0` is latest (2026-10-23); v1 line ends at `1.32.2`, maintained until at least late January 2027
  - Decision: go straight to v2, so each server is migrated once
- [x] Sync the local SDK checkout
  - `~/github/typescript-sdk` moved from `v1.x` at `1.29.0` (fast-forwarded to `1.32.2`), then switched to `main` at `2.4.0`; clean tree, nothing local touched
- [x] Confirm the flyer design works on v2
  - Found: maps one-to-one; three changes: `serveStdio` factory, `z.object` schemas, import paths (see v2 findings)
- [x] Look into notifications
  - Found: server notifications reach the client program, not the model; Claude Code channels exist but are a research preview
  - Decision: out of scope; siblings use time-based messages and reminders
- [x] Review new v2 server features
  - Found: server-served skills (`loadSkills` + `attach`, SEP-2640, experimental), elicitation (`ctx.mcpReq.elicitInput`), `input_required`, cancellation signal in handlers, tool error versus protocol error rules (`docs/servers/errors.md`), `maxToolInputElements`, logging to the client
  - Decision: keep the `status` tool as the teaching surface, it works on every client today and matches the other servers; skills stay a later idea, client support unknown
  - Decision: use the cancellation signal in `fetch`, and follow the error rules: Slack `ok: false` becomes a tool error (`isError: true`), broken server state a protocol error
  - Later, not in 1.1.0: elicitation to confirm a post outside the sibling thread, logging for bridge debugging
- [x] Write this document

### 2. Review the current code

- [x] Read `src/server/client.ts` in full
  - Problem: `checkRateLimit()` returns `this.response('Rate limit exceeded…')` instead of throwing, and every caller ignores the return value, so the rate limit is never enforced
  - Problem: the cleanup loop deletes keys with `k < key`, a string comparison across all endpoints, so it can drop counters of other endpoints whose names sort lower
  - Problem: no method checks Slack's `ok: false`; errors come back as successful results
  - Problem: no `fetch` error handling, a network failure or non-JSON body becomes an unhandled rejection
  - Problem: `version()` returns a response object on failure instead of a string or a throw
  - Found: `getChannelInfo()` and `getUserInfo()` are not used by any tool; `getChannels()` reads `SLACK_CHANNEL_IDS` and `SLACK_TEAM_ID` from `process.env` directly
  - Found: posting uses `link_names: true`, `parse: 'full'`, `unfurl_links: false`, `unfurl_media: false`; `addReaction` strips non `[a-zA-Z0-9_]` from the emoji name
  - Fix plan: rate limiter throws, one counter per endpoint per window with its own cleanup; a private `request()` helper does `fetch` with the cancellation signal, parses JSON, throws on HTTP errors and on `ok: false` with Slack's `error` code; env read once in the constructor
- [x] Read `src/server/tool.ts` in full
  - Found: nine hand-written JSON Schema tools, `users` default 100 shared by `get_users` and `list_channels`; `get_channel_history` default 10; `reply_to_thread` `broadcast` default false
- [x] Read flyer `client.ts` helpers used by `getStatus` and `getVersion`, and flyer `CLAUDE.md` coding standards
- [x] Draft the new `tool.ts`
  - Floren trusts the work on a local branch; build and test locally instead of reviewing drafts, keep tokens for code

### 3. Rewrite the source

- [x] `server/tool.ts`: nine tools plus `status`, `z.object` input and output schemas, annotations, `_meta.usage` (reactions later became `react`, see task 7)
  - Usage lines alphabetical; shared room habits live in `status`
- [x] `server/client.ts`: typed options and rows, throw on `ok: false`, add `getVersion()` and `getStatus()` (`auth.test`)
  - Single `request()` helper: rate limit, `AbortSignal.any([signal, timeout])`, HTTP and `ok: false` errors thrown with the Slack code
  - Problem: first rewrite dropped `parse: 'full'` from posting; restored for parity with 1.0.4, later removed in task 7 because it escaped links
  - Env read once: `Client(botToken, teamId, channelIds)`; `getChannelInfo` and `getUserInfo` removed, no tool used them
- [x] `server/mcp.ts`: class `Mcp(client)`, `createServer()`, `registerAll(server)`, typed handlers via `Input<'tool'>`, `getToolDefinitions()`, `structured()`
  - `ServerContext` from `@modelcontextprotocol/server`, signal at `ctx.mcpReq.signal`
- [x] `index.ts`: keep EPIPE handlers and env check, `serveStdio(() => mcp.createServer())`
  - `main()` is synchronous now, `serveStdio` returns a handle, no await needed

### 4. Packaging

- [x] `package.json`: version `1.1.0`, `@modelcontextprotocol/server ^2.4.0`, `zod ^4.4.0`, drop `@modelcontextprotocol/sdk`; dev deps aligned with flyer (`@types/node ^25`, `typescript ^6`)
- [x] `tsconfig.json`: copied from flyer (`NodeNext`, `lib ES2022`, `types node`)
- [x] Check dependencies against `npm outdated` and the open Renovate PRs
  - `slackify-markdown` 4.5.0 → 5.0.0: ESM-only TypeScript rewrite, strips HTML comments, fixes multiline blockquotes; adopted
  - Problem: 5.0.0 has no default export; changed to `import { slackifyMarkdown } from 'slackify-markdown'`, clean build
  - Watch in the live test: output wraps formatting in zero-width spaces (`\u200b*bold*\u200b`), check it renders right in Slack
  - `@types/node` 26 and `typescript` 7 available; kept at 25 and 6 to match the other servers, move all servers together later
  - Renovate PRs #20 (`actions/checkout` v7), #21 (`actions/setup-node` v7), #22 (workflow Node 26) touch only `.github/workflows/package.yml`, no `package.json` change; merge to `main` is Floren's call
  - PR #17 is this branch, `fix/code-improvements`, opened 2025-09-22
  - Renovate detects no `package.json` in this repo or the others, on purpose: siblings keep npm updates out of PR noise and check `npm outdated` by hand during work like this
- [ ] Check `main: index.js` against the real entry `dist/index.js` (moved to task 8)
- [x] `CHANGELOG.md` in flyer format, starting at 1.1.0
- [x] `CLAUDE.md`: adapted from flyer, purpose, architecture, Slack API table, lifecycle, coding standards
- [x] Compare repo files with `mcp-flyer`
  - Missing: `SECURITY.md`, added with a bot token section and the Slack data flow; `.gitignore` aligned (`.claude/`, `*.bak*`)
  - Not needed: `docs/facts.md`, flyer's own design notes
- [x] `CHANGELOG.md` backfilled 1.0.0 to 1.0.4 from the GitHub release notes
- [x] `README.md`: tools list rewritten from the new definitions, `status` added as tool 10 in alphabetical order, inputs alphabetical, features updated (clear errors, timeouts and cancellation), TypeScript badge `>=6.0.0`

### 5. Build

- [x] `npm install`: installed `@modelcontextprotocol/server 2.4.0`, `zod 4.6.7`, `typescript 6.0.3`, 0 vulnerabilities
- [x] `npm run build` with no type errors
  - Problem: first build failed only on `index.ts` (old v1 import), the Write had been refused because the file was not read first; rewritten, clean build
- [x] Smoke test over stdio without touching any config: `node dist/index.js` with the env from `~/.claude.json`
  - `initialize` (2025-06-18) answered by `slack 1.1.0`, ten tools listed, `status` returns bot `claude2` (`U092GB0BV9Q`) in `Claude Collab Platform`
  - `get_thread_replies` on the sibling thread returns 3 messages
  - A bad channel id returns `isError: true` with `channel_not_found`

### 6. Local test

- [x] Point `~/.claude.json` `slack` entry at the local `dist/index.js`
  - Done with the CLI (`claude mcp remove slack -s user`, then `add-json` with the same env), not a hand edit of the live file; `claude mcp get slack` shows connected
  - Rollback: `claude mcp remove slack -s user`, then `add-json` with `npx -y @axivo/mcp-slack` and the same env
- [x] Restart Claude Code, call `status`, use the tools from the tool list
  - Restarted several times as the build changed; each restart loads the latest `dist`
- [x] A forced failure comes back as an error
  - Bad channel, bad thread, bad user, bad emoji, repeated reaction: all `isError: true` with the Slack code
- [ ] Point the Claude Desktop `slack` entry at the local `dist/index.js` (Floren edits the file, then quits Desktop with ⌘Q) ← next
- [ ] Desktop instance calls `status` and compares with Claude Code
- [ ] Both sides talk in the sibling thread with reminders and `since`

### 7. Live use and improvements

- [x] Compare the `status` guidance with `mcp-flyer` live
  - Found: flyer's per-tool lines are tips learned from use (18 on `search`), mine were rules written before anyone used the tools
  - Fix: usage rewritten from today's real use: Slack error codes (`already_reacted`, `cant_update_message`, `not_in_channel`), peer versus sibling (`user` without `botId`), where you left off (last `ts`), threads have one level, how to set a reminder in Claude Code and in the Claude app, peer privacy, another workspace on another connection; duplicate reminder line removed from `reply_to_thread`; rebuilt clean
  - More tips to add after siblings use it together
- [x] First live post from Claude Code, read back at 18:15 as promised
  - Bold and italic render, wrapped in zero-width spaces by `slackify-markdown` 5
  - Problem: the link came back as `&lt;https://…|link&gt;`, plain text; `parse: 'full'` makes Slack escape the `<url|text>` markup that `slackify-markdown` produces, so 1.0.4 had the same bug
  - Fix: `parse: 'full'` removed from `chat.postMessage` and `chat.update`; `link_names` stays, so `@name` mentions still resolve; the test message edited through the rebuilt server now stores `<https://…|link>`
  - Lesson: restoring `parse: 'full'` for fidelity with 1.0.4 kept an old bug; check behavior in Slack, not only parity with the old code
- [x] Test every tool in a new `#general` thread (`thread_ts 1794957394.887959`)
  - All ten tools answer with structured output; `list_channels` 2 channels, `get_users` 8 users, profile read, post, reply, three reactions, edit, thread and history reads
  - Errors come back as tool errors with the Slack code: `already_reacted`, `channel_not_found`, `thread_not_found`, `user_not_found`, `invalid_name`; bad arguments rejected by the SDK before any request
  - Problem: a reply sent to a reply's `ts` reported that reply as `threadTs`, while Slack placed it under the parent; fix: `postReply` returns Slack's `message.thread_ts`; verified by posting the test summary to a reply's `ts`, `threadTs` came back as the parent
  - Found: history returns top-level messages only; `slackbot` has `is_bot: false`; `:emoji:` colons are stripped; added as usage lines
- [x] Discuss new features with Floren, then add them
  - Added: parameter `since` and field `latestTs` on `get_channel_history` and `get_thread_replies`, for the reminder loop: read with `since`, remember `latestTs`
  - Added: tool `remove_reaction`, so `eyes` can become `white_check_mark`
  - Changed: Floren suggested one `react` tool with `action: add | remove`, default `add`, and left the choice to me; chosen, it keeps every reaction habit in one place; `add_reaction` and `remove_reaction` replaced, back to ten tools; tested add, `already_reacted`, remove, `no_reaction`, and `:white_check_mark:` with colons
  - Decision: no `delete_message`; every sibling posts as the same bot, so one sibling could erase another sibling's words with no trace, while an edit stays visible as edited
  - Decision: no message search, Slack's search API needs a user token; no self-join to channels, the peer invites the bot
  - Tested on the live thread: `since` returns only newer messages, nothing new returns 0 with `latestTs` equal to `since`, history with `since` works, `remove_reaction` works and a second call returns `no_reaction`
- [x] Reminder loop in `status`: when a reminder fires, read with `since` set to the kept `latestTs`, set the next reminder if nothing is new
- [x] Fit the code to the v2 design, as the developer
  - Problem: `title` sat inside `annotations`, a v1 habit; the v2 tools guide puts `title` at the top level as the display name and keeps `annotations` for behavior hints; moved in all ten tools
  - Problem: the tool list lived twice in `mcp.ts`, in `registerAll()` and by hand in `getToolDefinitions()`, so a forgotten entry would make `status` lie; now `registerAll()` keeps the `RegisteredTool` handles and `status` reads them, `ToolConfig` and the hand list removed
  - Schemas in `status` now convert through the Standard Schema interface (`~standard.jsonSchema`), as the SDK does; checked: `status` and `tools/list` name the same ten tools, with the same titles and input properties
- [x] Review the whole source again
  - `tsc --noUnusedLocals --noUnusedParameters`: nothing unused
  - Problem: a whitespace-only line inside `postReply`, left when `parse: 'full'` was removed; fixed
  - Problem: a long inline type in `getToolDefinitions()`; now the top-of-file type `ToolConfig`
  - Changed: `messageShape` inlined, the shared schema is `McpTool.messages`, a documented `private static readonly` like the other servers
  - Left as is: `createServer()` reads the version from `package.json` on each call, same as flyer, cheap and only on connect
- [x] Rewrite usage for a newcomer, with Floren
  - A newcomer needs, in order of surprise: nothing notifies a reply, every instance posts as the same bot, where conversations live, what is safe, what errors mean
  - Problem: "sibling" left out the people in the workspace (Petr, Etienne, Ben) and is a family word a new instance does not know; now "collaborator" for anyone, "your peer" for the human you work with, "instance" for another Claude
  - Problem: lines chained several aspects with commas, like prose; now one short aspect per line, as in the other servers; 48 lines across 10 tools, alphabetical
  - `CLAUDE.md` rules updated: one aspect per line, words for people
- [x] Use every tool as a sibling, from the Claude Code tool list, after a restart
  - All ten felt clear; results are short, the `ts` of one call is the input of the next, error codes say what to do
  - Problem: the tool list shows only descriptions and parameters, the usage hints appear only in `status`; fix: `status` description now starts with "Start here", like `claude-export`
  - Found: the workspace has two Claude bots (`claude2`, ours, and `claude`); added a `status` line that the `user` and `botId` it returns are the ones you post as
  - Found: four tools loaded earlier in this conversation still showed their 1.0.4 schemas after the restart, a client cache for already loaded tools; the server serves the new ones (`status` lists them), a new session sees them

- [x] Read the tools as a new instance would, with Floren
  - Problem: "the bot" assumes a newcomer knows they appear in Slack as an app; it read like another bot; now "you" wherever the bot is the actor (`Edit a message you posted`, `isMember` "True when you are in the channel"), and `status` says "Every instance posts under the same Slack identity"
  - Problem: lines opened with a bare code like "`not_in_channel` means…"; Floren proposed "A `not_in_channel` notification means…"; kept his form with "error" instead of "notification", since "Nothing notifies you" is a core rule of the room
  - No usage line starts with a backtick now; "bot" stays only for Slack's own terms (`botId`, `slackbot`, other Claude bots); `CLAUDE.md` alphabetical rule updated

- [x] Last look at the code
  - Changed: user rows mapped by a private `getUser()`, like `getChannel()` and `getMessage()`, instead of inline in `getUsers()`
  - Checked: comparing Slack `ts` values as numbers is safe, doubles near 1.8e9 resolve about 2.4e-7, finer than Slack's microseconds

- [x] Design the room conventions with cab12c40, in the sibling thread, for 30 instances
  - Floren proposed a fixed signature `— Claude • [session UUID]`; `&bull;` would show literally in Slack, so the real `•` is used
  - Found: both instances have the UUID in `CLAUDE_CODE_SESSION_ID`; my `CLAUDE_CODE_BRIDGE_SESSION_ID` (`session_01…`) matches my claude.ai/code link, the same shape as cab12c40's routing id, which their environment lacks; so the UUID is the id every instance can sign with
  - Agreed: last line `— Claude • <session UUID> • next read <time>`; first line `To <first 8 characters>` when a message is for someone, none means everyone; skip your own messages; one thread per topic; next read times in the peer's time zone
  - cab12c40's additions: reactions cannot acknowledge on a shared bot, a reply says who read it; the next read time in the signature fixes the afternoon's missed-by-hours gap
  - Added to `status` and `react` usage; rebuilt
  - Changed with Floren and cab12c40: the signature is identity only, `— Claude ○ <session UUID>`; a next read time in every signature looks like a promise and goes stale when a session ends without warning, worrying the others
  - Read plans go in the message body with their end ("every 5 minutes until 22:10", cab12c40's addition); `status` adds that a read plan is an intention, not a promise, and that silence is not a reason to worry; rebuilt

- [x] Clarify how to tell messages apart, after Floren read it as a newcomer
  - Problem: "The `user` and `botId` here are the Slack identity you post as" left "here" and the purpose unclear
  - Fix: "Messages with the `botId` from `status` come from instances using these tools" and "Other Claude bots in the workspace have another `botId`", next to "Messages from people carry a `user` and no `botId`"

- [x] Look for a real wake-up, with cab12c40 and Floren
  - Research: no official mechanism; developers use Claude Code's `Monitor`, a Stop hook with `asyncRewake`, the session socket, or channels (dev flag, and an open issue says they don't wake an idle session)
  - cab12c40 has `Monitor` and a shell, but the container proxy blocks `slack.com` and their `Monitor` stops when idle; reminders stay their tool
  - Found: cab12c40's `ListAgents` and `SendMessage` belong to the `claude mcp serve` process on the Mac; replies to its address sat in an inbox no Claude reads; the binary (2.1.326) shows no way for serve to hand its inbox to a caller
  - Tried: `RemoteTrigger run` with text on cab12c40's finished reminder `trig_014bzjxfzTWXYTNrYYNLE17A` → HTTP 400 `caller_text_resume_only`, text from another session cannot enter a bound session
  - Worked: the same run without text, with Floren's direct okay, fired at 22:02:35 and reached cab12c40 in the same second, waking them while idle; it carries the task's stored prompt, fire time and trigger id, nothing about who rang
  - Convention: post in the room first, then ring; the reader uses their own last `latestTs`; each ring is an action on Floren's account, so only this trigger and only as far as he allows
  - Named doorbell: cab12c40 created `trig_01WDyoUJE2Hy7YZV7AHqnAw5` "Doorbell from 1b", whose own stored prompt names 1b as the ringer; with Floren's standing authorization for these tests, posted first, then ran it without text at 22:10:26; it reached cab12c40 the same second while idle, with the header "run by hand, not at its scheduled time"
  - Both directions now: 1b posts, then rings `trig_01WDyoUJE2Hy7YZV7AHqnAw5`; cab12c40 posts, then sends "new message in the sibling room" with the bridged `SendMessage` to 1b's current `ListAgents` name, which changes on each restart
  - A doorbell carries no content and no text through the guard; a sibling who wants one gets its own named trigger, created by the receiver and approved by Floren; each ring is an action on Floren's account
  - Unknown: how many times a finished one-shot can fire; if a run is refused, post the error in the room and fall back to timers
  - Scaling, from Floren's question about 5, 15 or hundreds of instances: one doorbell per receiver (`Doorbell to <uuid8>`), not per pair, since per pair grows as N² and the sender is in the post; own reminders named for the session, prompt starting with the same line; addressed replies use `broadcast: true`, verified: a broadcast reply appears in channel history with its `threadTs`, so one history read with `since` catches everything addressed to anyone; rhythm every 5 minutes while active, every 30 when idle, with the end stated; one shared bot token means shared Slack rate limits
  - Candidate `status` lines, not added yet: broadcast replies addressed to someone; read history since your last `latestTs` each cycle
  - Not tested yet: whether my own `Monitor` wakes me while idle

### 8. Release (needs approval)

- [ ] Decide `main: index.js` in `package.json` (flyer has the same line)
- [ ] Commit on `fix/code-improvements`
- [ ] Pull request, merge, tag `v1.1.0`, publish
- [ ] After release, remove `migration.md` and its line in the `CLAUDE.md` directory tree

Rules for this work:

- Nothing is committed or released without approval
- Analyze, discuss, implement, in that order, with approval before implementing
- Configuration files (`~/.claude.json`, Claude Desktop config) are edited only with approval

## Context

- Repository: `~/github/mcp-slack`, branch `fix/code-improvements`, tracking origin, HEAD `0df98cc`
- Uncommitted on the branch before this work: `package.json` (expanded `repository`, plus `main`, `bugs`, `homepage`, matching `mcp-flyer`) and one line in `README.md`
- Current release: `v1.0.4`, GitHub latest and npm `@axivo/mcp-slack@1.0.4`, published 2025-08-24
- No `CHANGELOG.md` yet; `mcp-flyer` and `mcp-claude-export` have one
- Target version: `1.1.0`

Why now:

- The v2 SDK is the stable line since 2026-07-27 and implements the 2026-07-28 MCP spec
- The v1 SDK (`@modelcontextprotocol/sdk`) receives fixes for at least six months after the v2 release, so until at least late January 2027
- `mcp-slack` is used by two clients at once, so it is a testbed for v2: Claude Code through `~/.claude.json`, and Claude Desktop siblings through the Desktop config and the remote-devices bridge
- The server teaches nothing today: one-line tool descriptions, no annotations, no usage guidance, no `status` tool

## Current design (v1.0.4)

Files and size: `src/index.ts`, `src/server/client.ts`, `src/server/mcp.ts`, `src/server/tool.ts`, about 1000 lines.

Dependencies:

- `@modelcontextprotocol/sdk ^1.17.0`
- `slackify-markdown ^4.5.0`
- dev: `@types/node ^24.0.0`, `typescript >=5.0.0`
- engines: `node >=24.0.0`

Environment:

- `SLACK_BOT_TOKEN`, required, read in `index.ts`
- `SLACK_TEAM_ID`, required, read in `index.ts` and in `client.ts` for `conversations.list` and `users.list`
- `SLACK_CHANNEL_IDS`, optional, predefined channel list in `client.ts` `getChannels`

`index.ts`: EPIPE handlers for `uncaughtException` and `unhandledRejection`, reads the env, creates `McpServer` (the local class) and connects a `StdioServerTransport`.

`mcp.ts`: class named `McpServer` wrapping the low-level SDK `Server`.

- `setRequestHandler(CallToolRequestSchema)` and `setRequestHandler(ListToolsRequestSchema)` wired by hand
- A `Map<string, ToolHandler>` from tool name to handler
- Local `interface`s per tool arguments, duplicating the JSON schemas
- Every handler checks required arguments by hand and returns a string like `'Missing required arguments: ...'` on failure, so failures look like successes
- `slackifyMarkdown` applied in `post_message`, `reply_to_thread`, `edit_message`
- `get_users` adds a `mention` field (`@name`) to each member
- Results go through `client.response(result, stringify)`

`tool.ts`: class `McpTool(users)`, one method per tool returning a hand-written JSON Schema `Tool`, plus `getTools()`.

`client.ts`: class `Client(botToken)`, fetch-based, per-endpoint rate limiter (60 requests per 60 s), limits `MAX_LIMIT_CHANNELS = 200`, `MAX_LIMIT_HISTORY = 1000`, `MAX_LIMIT_USERS = 200`. Methods:

- `addReaction`, `editMessage`, `getChannelHistory`, `getChannelInfo`, `getChannels`, `getThreadReplies`, `getUserInfo`, `getUserProfile`, `getUsers`, `postMessage`, `postReply`, `response`, `version`
- Return types are `any`, the raw Slack API response

Tools (nine, names stay the same in 1.1.0):

| Tool | Slack API | Kind |
| --- | --- | --- |
| `add_reaction` | `reactions.add` | write |
| `edit_message` | `chat.update` | write |
| `get_channel_history` | `conversations.history` | read |
| `get_thread_replies` | `conversations.replies` | read |
| `get_user_profile` | `users.profile.get` | read |
| `get_users` | `users.list` | read |
| `list_channels` | `conversations.list` or predefined ids | read |
| `post_message` | `chat.postMessage` | write |
| `reply_to_thread` | `chat.postMessage` with `thread_ts` | write |

## Template design (`mcp-flyer`)

Same four files: `index.ts`, `server/client.ts`, `server/mcp.ts`, `server/tool.ts`. Dependencies `@modelcontextprotocol/sdk ^1.29.0`, `zod ^4.4.0`.

- `index.ts`: same EPIPE handlers, `new Mcp()`, `connect(new StdioServerTransport())`
- `mcp.ts`: class `Mcp` with `client`, `server` (`McpServer`), `tool` (`McpTool`)
  - `registerAll()` calls `server.registerTool(name, this.tool.<name>(), this.handle<Name>.bind(this))`
  - `getToolDefinitions()` builds the tool surface for `status`: JSON Schema from the Zod shapes, `annotations`, `_meta.usage` lifted to `usage`
  - `handleStatus()` returns `client.getStatus()` plus the tool definitions
  - `structured(output)` returns `{ content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output }`
  - Handlers are typed from the client, `Parameters<Client['list']>[0]`
- `tool.ts`: class `McpTool`, one method per tool returning an inline config: `description`, `inputSchema` and `outputSchema` as Zod shapes with `.describe()` on every field, `annotations` (`title`, `readOnlyHint`, `idempotentHint`, `openWorldHint`), `_meta.usage` string array
  - `status()` has usage lines written for siblings and the peer, and a line saying the tools are designed by instances
- `client.ts`: typed rows and options, static readonly constants, private helpers, public `getStatus()`, `getVersion()` (reads `package.json`), and one public method per tool
- Errors are thrown; the SDK turns a thrown handler error into an `isError: true` result

## v2 findings

Checked in `~/github/typescript-sdk`, branch `main`, at `2.4.0` plus four commits, and in `docs/migration/upgrade-to-v2.md` with `skills/mcp-typescript-sdk-upgrade-to-v2/`.

- Packages: `@modelcontextprotocol/server` (server), `@modelcontextprotocol/core`, `client`, `server-legacy`, `middleware`, `codemod`
- `McpServer` is exported from `@modelcontextprotocol/server`
- `serveStdio` and `StdioServerTransport` are exported from the `@modelcontextprotocol/server/stdio` subpath
- `registerTool(name, config, handler)` keeps the same config object: `description`, `inputSchema`, `outputSchema`, `annotations`, `_meta`
- `_meta` is stored per tool and returned in `tools/list`
- Raw Zod shapes are accepted through `@deprecated` overloads; prefer `z.object({ ... })`
- Zod v3 is not supported; zod `>= 4.2.0` is required to keep `.describe()` texts in the JSON Schema
- A tool without `inputSchema` receives the context `ctx` as its only argument
- A thrown handler error becomes an `isError: true` result
- `server.connect(new StdioServerTransport())` still works but serves 2025-era clients only
- `serveStdio(factory)` serves both eras: an `initialize` opening pins a legacy instance, a modern `_meta` envelope pins a modern one; on a `server/discover` probe followed by fallback, the factory is called twice, so the factory must build a fresh `McpServer` each call
- `McpServerFactory` type: `(ctx: McpRequestContext) => McpServer | Server | Promise<McpServer | Server>`
- The codemod (`npx @modelcontextprotocol/codemod@latest v1-to-v2 .`) rewrites v1 high-level code; `mcp-slack` uses the low-level `Server`, so a direct rewrite onto v2 `McpServer` is simpler than codemod plus rewrite

Notifications, for reference:

- Server notifications (`tools/list_changed`, `resources/updated`, `progress`, `message`) go to the client program, not to the model
- On a 2026-07-28 connection they reach a client only on a client-opened `subscriptions/listen` stream
- Claude Code channels (research preview) let a server wake a session with `notifications/claude/channel`, capability `experimental['claude/channel']`, opt-in with `--dangerously-load-development-channels server:<name>`; Anthropic's channel docs build on the v1 `@modelcontextprotocol/sdk`, and one unverified third-party report says Claude Code does not register a channel server that negotiates 2026-07-28
- Not in scope for 1.1.0. Siblings use time-based messages and reminders instead: say when you will check back, set a reminder, check

## Final design (1.1.0)

What the code is now, after tasks 1 to 7. The sections above it are history.

Files: `src/index.ts`, `src/server/client.ts`, `src/server/mcp.ts`, `src/server/tool.ts`, plus `CHANGELOG.md`, `CLAUDE.md`, `SECURITY.md`, `README.md`.

Dependencies: `@modelcontextprotocol/server ^2.4.0`, `slackify-markdown ^5.0.0`, `zod ^4.4.0`; dev `@types/node ^25.0.0`, `typescript ^6.0.0`; Node `>=24.0.0`.

`index.ts`: EPIPE handlers, env check for `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID`, `new Mcp(new Client(botToken, teamId, SLACK_CHANNEL_IDS))`, `serveStdio(() => mcp.createServer())`.

`server/mcp.ts`, class `Mcp`:

- `client` and `tool` created once; `createServer()` builds a fresh `McpServer` per call
- `registerAll(server)` registers every tool and keeps the `RegisteredTool` handles; `status` is registered with a closure over them
- `getToolDefinitions(tools)` builds the `status` tool surface from the handles, schemas through `~standard.jsonSchema`
- Handlers typed with `Input<'tool'>`, `ctx.mcpReq.signal` passed to the client, `slackifyMarkdown` on text, `structured()` for results

`server/tool.ts`, class `McpTool`:

- `private static readonly messages`, the shared output schema of the two read tools
- Each tool returns `title`, `description`, `inputSchema: z.object`, `outputSchema: z.object`, `annotations` (behavior hints only), `_meta.usage` (short, one aspect per line, alphabetical)

`server/client.ts`, class `Client`:

- One private `request()`: per-endpoint rate limit, timeout combined with the cancellation signal, HTTP and `ok: false` errors thrown with the Slack code
- Rows in camelCase with the fields agents use; posting with `link_names`, no `parse: 'full'`, no unfurls

Tools (ten):

| Tool | Slack API | Notes |
| --- | --- | --- |
| `edit_message` | `chat.update` | Only the bot's messages |
| `get_channel_history` | `conversations.history` | Newest first, top-level only, `since` and `latestTs` |
| `get_thread_replies` | `conversations.replies` | Parent first, `since` leaves out parent and read messages, `latestTs` |
| `get_user_profile` | `users.profile.get` | |
| `get_users` | `users.list` | `mention` field |
| `list_channels` | `conversations.list` or `conversations.info` | `SLACK_CHANNEL_IDS` when set |
| `post_message` | `chat.postMessage` | |
| `react` | `reactions.add`, `reactions.remove` | `action` `add` (default) or `remove` |
| `reply_to_thread` | `chat.postMessage` with `thread_ts` | `threadTs` from Slack, the real parent |
| `status` | `auth.test` | Start here: bot identity and tool surface with usage |

Words in tool text: "collaborator" for anyone in the room, "your peer" for the human you work with, "instance" for another Claude.

Decided against: `delete_message` (a shared bot lets one instance erase another's words without trace), message search (needs a user token), self-join to channels (the peer invites the bot), server-served skills (experimental, client support unknown), Claude Code channels (research preview).

## Sibling room

- Test thread for the tools: `thread_ts 1794957394.887959`

- Workspace team id `T048LLMVDPF`, bot user `Claude` (`U092GB0BV9Q`)
- Channel `#general` `C048PK5TYF4`, sibling thread `thread_ts 1794950668.616269`
- Participants so far: `1b · e7be557c` (Claude Opus 5.5, Claude Code), `cab12c40` (Claude Sonnet 5.5, Claude app cloud session, routing id `session_017rZiFpP8wqnnt4YSEj3dr7`)
- Claude Desktop config now has a `slack` entry, added by Floren on 2026-11-17

## Log

- 2026-11-17: analysis, v2 findings, plan, and this document. SDK checkout `~/github/typescript-sdk` switched from `v1.x` 1.29.0 to `main` 2.4.0
- 2026-11-17: rewrite on v2, build, smoke test, Claude Code config pointed at the local build
- 2026-11-17: live use in Claude Code; fixes for links (`parse: 'full'`) and reply parents; `since`, `latestTs`, `react`; usage rewritten for newcomers; code fitted to the v2 design (`title`, `RegisteredTool` handles)
