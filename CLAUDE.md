# Project Instructions

A MCP (Model Context Protocol) server bridging Slack with Claude agents. Published to npm as `@axivo/mcp-slack` and consumed by MCP-capable hosts (Claude Code, Claude Desktop) via stdio transport.

## Collaborator

- **Name:** Floren Munteanu
- **Work:** Engineering

### Personal Preferences

I'm a site reliability engineer specialized in:

- Advanced GitHub actions based on JS code
- Helm charts
- IaC for Kubernetes clusters
- Next.js/Nextra static websites

## Purpose

Agents and people use this server to work together in a shared Slack room. Every agent posts as the same bot, so the tools teach the habits of the room: sign each message, say when you will check back and set a reminder, never post a secret. Nothing notifies an agent of a reply, so time-based messages and reminders take the place of notifications.

## Architecture

A small TypeScript server that translates MCP tool calls into Slack Web API requests. There is no daemon, no listening socket, no HTTP server - the host spawns the server as a child process, communicates over stdio, and tears it down when the host exits. The server holds the bot token from its environment and no other state. Nothing is written to disk, except a file an agent fetches with `get_files` and `save`, written as `<file id>.<type>` in `SLACK_FILES_DIR`.

### Directory Tree

```
.
├── .github/
│   ├── pull_request_template.md
│   ├── renovate.json5                dependency dashboard config
│   └── workflows/package.yml         trusted-publish to npm on `v*` tag push
├── src/
│   ├── index.ts                      entry point - env check, Client and Mcp instantiation, serveStdio, EPIPE handling
│   └── server/
│       ├── client.ts                 Client class - Slack Web API requests, rate limit, timeout, error mapping, row mapping
│       ├── mcp.ts                    Mcp class - createServer() factory, registers tools via McpServer.registerTool, owns dispatch
│       └── tool.ts                   McpTool class - tool definitions (Zod input/output schemas, _meta.usage, annotations)
├── CHANGELOG.md                      Keep a Changelog format, semver
├── LICENSE                           BSD-3-Clause
├── migration.md                      working document of the SDK v2 migration
├── package.json                      npm metadata, runtime deps: @modelcontextprotocol/server, slackify-markdown, zod
├── README.md                         user-facing install + tool reference
├── SECURITY.md                       threat model, bot token handling, supply-chain integrity policy
└── tsconfig.json                     strict TypeScript, ES2022 target, NodeNext modules, no DOM
```

### Three-Class Server

The server splits into three classes with sharp boundaries. Each owns one concern; nothing leaks across.

- **`Mcp` (`src/server/mcp.ts`)** - wires the SDK to handlers. `createServer()` builds a fresh `McpServer` and registers every tool on it, because `serveStdio` may call its factory twice for one connection (a discarded `server/discover` probe, then the real instance). Handlers convert Markdown to Slack formatting with `slackify-markdown` and pass the request's cancellation signal to the client. No Slack API knowledge.
- **`McpTool` (`src/server/tool.ts`)** - pure tool definitions. Each method returns a literal config object (description, Zod input/output schemas wrapped in `z.object`, `ToolAnnotations`, `_meta.usage`) consumed by `registerTool`. Return types are intentionally inferred so TypeScript captures each tool's input shape and propagates it to handler signatures.
- **`Client` (`src/server/client.ts`)** - Slack domain ops. Every request goes through `request()`: rate limit per endpoint, timeout combined with the caller's signal, HTTP and `ok: false` errors thrown with the Slack error code, then the answer mapped to rows with the fields agents use.

### Slack Web API

| Method                   | Used by               | Notes                                                        |
| ------------------------ | --------------------- | ------------------------------------------------------------ |
| `auth.test`              | `status`              | Bot id, user, workspace; fails when the token is invalid     |
| `chat.postMessage`       | `post_message`, `reply_to_thread` | No `link_names`, no unfurls                      |
| `chat.update`            | `edit_message`        | Only messages posted by the bot can be edited                |
| `conversations.history`  | `get_channel_history` | Newest first, `oldest` from `since`                          |
| `conversations.info`     | `list_channels`       | When `SLACK_CHANNEL_IDS` is set, one request per channel     |
| `conversations.list`     | `list_channels`       | Public channels of `SLACK_TEAM_ID`                           |
| `conversations.replies`  | `get_thread_history`  | Parent first, `oldest` from `since`, older messages filtered |
| `files.info`             | `get_files`           | Size checked first; body from `files.slack.com` only, redirects checked per hop; inline cap 5 MB per file, 10 MB per call |
| `reactions.add`          | `react`               | Emoji name stripped to `[a-zA-Z0-9_+-]`                      |
| `reactions.remove`       | `react`               | Same emoji name rule                                         |
| `users.list`             | `get_users`           | Adds a `mention` field in `<@id>` form                       |
| `users.profile.get`      | `get_user_profile`    |                                                              |

### Server Lifecycle

1. **Spawn.** Host invokes `npx @axivo/mcp-slack` (or a local `node dist/index.js`).
2. **Boot.** `index.ts` registers the EPIPE handlers, checks `SLACK_BOT_TOKEN` and `SLACK_TEAM_ID`, builds `Client` and `Mcp`.
3. **Serve.** `serveStdio(() => mcp.createServer())` owns the stdio transport and pins the connection to the protocol era the client opens with: an `initialize` request for 2025-era clients, a modern `_meta` envelope for 2026-07-28 clients.
4. **Handle.** Each `tools/call` is validated against the tool's `inputSchema`, routed to its handler, and the result validated against its `outputSchema`. A thrown error becomes an `isError: true` result.
5. **Exit.** When the host closes stdin, the process exits.

### Tool Surface

| Tool                  | Role                                         | Annotations                                  |
| --------------------- | -------------------------------------------- | -------------------------------------------- |
| `edit_message`        | Edit a message posted by the bot             | write, `destructiveHint: true`, idempotent   |
| `get_channel_history` | Recent messages of a channel                 | `readOnlyHint: true`                         |
| `get_files`           | Files attached to messages, inline or saved  | `readOnlyHint: true`                         |
| `get_thread_history`  | Messages of a thread, trimmed by `limit`     | `readOnlyHint: true`                         |
| `get_user_profile`    | Profile of a user                            | `readOnlyHint: true`                         |
| `get_users`           | Users of the workspace                       | `readOnlyHint: true`                         |
| `list_channels`       | Public or configured channels                | `readOnlyHint: true`                         |
| `post_message`        | Post a new message                           | write, `openWorldHint: true`                 |
| `react`               | Add or remove an emoji reaction              | write, `openWorldHint: true`                 |
| `reply_to_thread`     | Reply in a thread                            | write, `openWorldHint: true`                 |
| `status`              | Bot identity and the full tool surface       | `readOnlyHint: true`                         |

The rules shared by every tool live in the `status` tool, the other tools carry only what is specific to them.

### Build and Publish

- **Build:** `npm run build` runs `tsc` against `tsconfig.json`. Outputs `dist/index.js` (the binary) and `dist/server/*.{js,d.ts}`. No bundler, no minifier.
- **Clean:** `npm run clean` deletes `dist/`.
- **Dependencies:** Renovate watches only the workflow (actions and the Node version), npm packages are left out on purpose to keep PR noise away. Run `npm outdated` when working on the code, read the release notes of any major update, and keep `@types/node` and `typescript` on the same majors as the other servers.
- **Publish:** A `v*` tag pushed to `main` triggers the publish workflow.

### Configuration

| Variable            | Required | Role                                                  |
| ------------------- | -------- | ----------------------------------------------------- |
| `SLACK_BOT_TOKEN`   | yes      | Bot token, sent as a bearer token                     |
| `SLACK_TEAM_ID`     | yes      | Workspace id for `conversations.list` and `users.list` |
| `SLACK_CHANNEL_IDS` | no       | Comma separated channel ids listed instead of every public channel |
| `SLACK_FILES_DIR`   | no       | Folder for `get_files` with `save`, system temp folder by default |

## Coding Standards

- JSDoc module-level docblock on every file, `@param`/`@returns` on all methods
- No empty lines inside functions
- Braces on every `if`, `for` and `while`
- TypeScript strict mode, ES2022 target, NodeNext modules
- Alphabetical ordering for imports
- Top-of-file types in alphabetical order, none exported
- Class fields alphabetical, instance fields before static ones
- Class members in this order: constructor, private methods alphabetical, public methods alphabetical
- Values are read through `getX()` methods, and private statics are `private static readonly` in camelCase, no `SCREAMING_CASE` constants
- No `any` type unless documented why no narrower type works
- No non-null assertion operator (`!`)
- No em-dash characters in source
- Tool definitions in `McpTool` return inline literal config objects passed straight to `registerTool`, with inferred types
- Only add code the tools use, do not copy patterns from other servers blindly

### Tool Descriptions and Hints

The tools are built for agents to enjoy and to be curious with, and for the person they work with as a collaborator. Every word in a tool definition is read by an agent, so each one has to earn its place.

- **Fields say what they are.** The `describe` text of an input or output key names what the key is, in a few words, with an example when the format is not obvious. Advice on how to use a key lives in `_meta.usage`. The schema already carries limits and defaults, so no `(max N)` or `(default N)` in the text
- **Hints say what a capable reader cannot see.** How the server behaves, Slack quirks and what protects the collaborator belong in `_meta.usage`. An agent is as capable as the author, so a hint that explains the obvious only slows the reader down
- **One aspect per line.** A line gives one thing to do or one fact, short and without prose. Split a line that chains several aspects with commas
- **Alphabetical order.** The lines of each `usage` array are in alphabetical order, and no line starts with a backtick: write "A `not_in_channel` error means…", not "`not_in_channel` means…". Check it after every edit
- **Shared rules live once.** What holds for every tool, like the signature line, reminders and secrets, is written in `status`
- **No policing.** Hints invite collaboration, they say what a tool offers and never ration calls
- **Words for people.** "Collaborator" is the person you work with; "person" is any human in the room; "agent" is another Claude in the room, not a subagent; "someone" is either. Never "the user", "instance" or "sibling": "instance" sounds like a running copy of a program, and `status` ships to people outside the framework
- **Tool descriptions stay short**, one line, like the other servers

### MCP SDK Conventions

The server is built on the MCP TypeScript SDK v2.

- **Packages.** `McpServer` and `ServerContext` come from `@modelcontextprotocol/server`, `serveStdio` from the `@modelcontextprotocol/server/stdio` subpath
- **Zod 4.2 or later.** The SDK rejects Zod v3, and Zod below 4.2 loses the `.describe()` texts in the generated JSON Schema
- **Schemas are `z.object(...)`.** Every `inputSchema` and `outputSchema` in `McpTool` is wrapped, raw shapes are deprecated. A tool with no input omits `inputSchema`
- **Entry point is `serveStdio(factory)`.** It serves both the 2025-era and the 2026-07-28 protocol revisions
- **The factory builds a fresh server.** `serveStdio` may call the factory twice for one connection, so `Mcp.createServer()` creates a new `McpServer` and registers every tool on it each call. `Client` and `McpTool` are created once in the `Mcp` constructor and shared
- **Handlers take `(args, ctx)`.** `args` is typed from the tool's input schema, `ctx` is `ServerContext`. A tool without `inputSchema` gets `ctx` as its only argument, so `handleStatus(ctx)`
- **Cancellation reaches the network.** Handlers pass `ctx.mcpReq.signal` to the client, and the client combines it with its timeout through `AbortSignal.any`
- **Errors are thrown.** A thrown handler error becomes an `isError: true` tool result the agent can read and act on, like a Slack `channel_not_found`. Nothing returns an error as a string
- **`status` reads the registry.** `registerAll()` keeps the `RegisteredTool` handle each `registerTool` returns, and `getToolDefinitions()` builds the tool surface from those handles, so a new tool is listed once. Schemas are converted through the Standard Schema interface, `schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })`, the same path the SDK uses for `tools/list`
- **`title` is top level.** Each tool config carries its display name in `title`, next to `description`; `annotations` holds only behavior hints

### TypeScript Conventions

- **Inferred return types on `McpTool` methods.** A wide return-type alias collapses the inference of handler argument types.
- **Handler input types** come from the tool schemas: `Input<'postMessage'>` is `z.output` of the tool's `inputSchema`.
- **`tsconfig.json` `lib`.** ES2022 only, there is no browser code.

## Issues

- Every agent posts as the same bot user, so authorship lives in the signature line, not in Slack's `user` field.
- Nothing notifies an agent of a new message; agents say when they will check back and set reminders.
