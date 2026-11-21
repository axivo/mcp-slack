/**
 * Slack API client
 *
 * @module server/client
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * A channel as returned to the agent
 */
type ChannelRow = {
  id: string;
  isMember: boolean;
  isPrivate: boolean;
  members: number;
  name: string;
  purpose: string;
  topic: string;
};

/**
 * Result of a channel listing
 */
type ChannelsResult = {
  channels: ChannelRow[];
  count: number;
  nextCursor: string;
};

/**
 * Result of an edit
 */
type EditResult = {
  channel: string;
  text: string;
  ts: string;
};

/**
 * How a file reached the agent
 */
type FileDelivery = 'image' | 'refused' | 'resource' | 'saved' | 'text';

/**
 * A fetched file as returned to the agent, with its content when delivered inline
 */
type FileResult = {
  data?: string;
  delivered: FileDelivery;
  id: string;
  mimetype: string;
  name: string;
  path?: string;
  reason?: string;
  size: number;
  text?: string;
  truncated?: boolean;
  user: string;
};

/**
 * Result of a file fetch
 */
type FilesResult = {
  files: FileResult[];
};

/**
 * A file attached to a message, as returned to the agent
 */
type FileRow = {
  id: string;
  mimetype: string;
  name: string;
  size: number;
};

/**
 * Options of a channel history read
 */
type HistoryOptions = {
  channelId: string;
  limit: number;
  since?: string;
};

/**
 * A message as returned to the agent
 */
type MessageRow = {
  botId?: string;
  files?: FileRow[];
  reactions?: ReactionRow[];
  replyCount?: number;
  text: string;
  threadTs?: string;
  ts: string;
  user?: string;
};

/**
 * Result of a channel history or thread read
 */
type MessagesResult = {
  channel: string;
  count: number;
  hasMore: boolean;
  latestTs: string;
  messages: MessageRow[];
};

/**
 * Options of a paged listing
 */
type PageOptions = {
  cursor?: string;
  limit: number;
};

/**
 * Result of pinning or unpinning a message
 */
type PinResult = {
  action: 'add' | 'remove';
  channel: string;
  ts: string;
};

/**
 * A message pinned to a channel
 */
type PinRow = {
  created: number;
  text: string;
  ts: string;
  user?: string;
};

/**
 * Pinned messages of a channel
 */
type PinsResult = {
  channel: string;
  count: number;
  pins: PinRow[];
};

/**
 * Result of a posted message or reply
 */
type PostResult = {
  channel: string;
  threadTs?: string;
  ts: string;
};

/**
 * Per endpoint request counter for the current window
 */
type RateCounter = {
  count: number;
  window: number;
};

/**
 * Result of a reaction
 */
type ReactionResult = {
  channel: string;
  reaction: string;
  ts: string;
};

/**
 * A reaction on a message, with who added it
 */
type ReactionRow = {
  count: number;
  name: string;
  users: string[];
};

/**
 * Channel as sent by Slack
 */
type SlackChannel = {
  id: string;
  is_archived?: boolean;
  is_member?: boolean;
  is_private?: boolean;
  name?: string;
  num_members?: number;
  purpose?: { value?: string };
  topic?: { value?: string };
};

/**
 * File as sent by Slack
 */
type SlackFile = {
  filetype?: string;
  id: string;
  mimetype?: string;
  name?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
  user?: string;
};

/**
 * Message as sent by Slack
 */
type SlackMessage = {
  bot_id?: string;
  files?: SlackFile[];
  reactions?: SlackReaction[];
  reply_count?: number;
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
};

/**
 * A pinned item as Slack sends it in `pins.list`
 */
type SlackPin = {
  created?: number;
  message?: SlackMessage;
  type: string;
};

/**
 * A reaction as Slack sends it on a message
 */
type SlackReaction = {
  count?: number;
  name: string;
  users?: string[];
};

/**
 * Common envelope of every Slack Web API answer
 */
type SlackResponse = {
  error?: string;
  has_more?: boolean;
  ok: boolean;
  response_metadata?: { next_cursor?: string };
};

/**
 * Options of a thread read
 */
type ThreadOptions = {
  channelId: string;
  limit: number;
  since?: string;
  threadTs: string;
};

/**
 * User as sent by Slack
 */
type SlackUser = {
  deleted?: boolean;
  id: string;
  is_bot?: boolean;
  name?: string;
  profile?: { display_name?: string; real_name?: string };
  real_name?: string;
  tz?: string;
};

/**
 * Result of the status check
 */
type StatusResult = {
  botId: string;
  team: string;
  teamId: string;
  user: string;
  userId: string;
  version: string;
};

/**
 * A user profile as returned to the agent
 */
type UserProfileRow = {
  displayName: string;
  realName: string;
  statusEmoji: string;
  statusText: string;
  title: string;
  userId: string;
};

/**
 * A user as returned to the agent
 */
type UserRow = {
  deleted: boolean;
  displayName: string;
  id: string;
  isBot: boolean;
  mention: string;
  name: string;
  realName: string;
  timezone: string;
};

/**
 * Result of a user listing
 */
type UsersResult = {
  count: number;
  nextCursor: string;
  users: UserRow[];
};

/**
 * Slack API client
 *
 * Calls the Slack Web API with the bot token, one request per call, with a
 * per endpoint rate limit and a request timeout. Every answer is checked:
 * an HTTP error or a Slack `ok: false` throws with the Slack error code, so
 * the agent sees a failure as a failure.
 *
 * @class Client
 */
export class Client {
  private botToken: string;
  private channelIds: string[];
  private filesDir: string;
  private headers: Record<string, string>;
  private rateCounters: Map<string, RateCounter>;
  private teamId: string;
  private version: string;
  private static readonly apiUrl = 'https://slack.com/api';
  private static readonly fileHost = 'files.slack.com';
  private static readonly fileTimeoutMs = 60000;
  private static readonly maxChannels = 200;
  private static readonly maxFileBytes = 20 * 1024 * 1024;
  private static readonly maxHistory = 1000;
  private static readonly maxInlineBytes = 5 * 1024 * 1024;
  private static readonly maxRedirects = 2;
  private static readonly maxReplyPage = 200;
  private static readonly maxTextChars = 50000;
  private static readonly maxTotalBytes = 10 * 1024 * 1024;
  private static readonly maxUsers = 200;
  private static readonly rateLimitRequests = 60;
  private static readonly rateLimitWindowMs = 60000;
  private static readonly requestTimeoutMs = 10000;

  /**
   * Creates a new Client instance
   *
   * @param {string} botToken - Slack bot token
   * @param {string} teamId - Slack workspace id
   * @param {string} [channelIds] - Comma separated channel ids listed instead of every public channel
   * @param {string} [filesDir] - Folder where downloaded files are saved, a folder in the system temp directory by default
   */
  constructor(botToken: string, teamId: string, channelIds?: string, filesDir?: string) {
    this.botToken = botToken;
    this.channelIds = channelIds ? channelIds.split(',').map((id) => id.trim()).filter((id) => id.length > 0) : [];
    this.filesDir = filesDir && filesDir.trim().length > 0 ? filesDir.trim() : join(tmpdir(), 'mcp-slack-files');
    this.headers = { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' };
    this.rateCounters = new Map();
    this.teamId = teamId;
    this.version = this.getVersion();
  }

  /**
   * Checks that a URL points to Slack's file host over HTTPS
   *
   * @private
   * @param {URL} target - URL about to receive the bot token
   * @throws {Error} When the URL is anywhere else
   */
  private checkFileHost(target: URL): void {
    if (target.protocol !== 'https:' || target.hostname !== Client.fileHost) {
      throw new Error(`Refused to send the token to '${target.hostname}', only '${Client.fileHost}' is allowed`);
    }
  }

  /**
   * Counts a request against the endpoint rate limit
   *
   * @private
   * @param {string} endpoint - Slack Web API method
   * @throws {Error} When the endpoint has reached its limit for the current window
   */
  private checkRateLimit(endpoint: string): void {
    const window = Math.floor(Date.now() / Client.rateLimitWindowMs);
    const counter = this.rateCounters.get(endpoint);
    if (!counter || counter.window !== window) {
      this.rateCounters.set(endpoint, { count: 1, window });
      return;
    }
    if (counter.count >= Client.rateLimitRequests) {
      throw new Error(`Rate limit reached for '${endpoint}', try again in a minute`);
    }
    counter.count++;
  }

  /**
   * Maps a Slack channel to a channel row
   *
   * @private
   * @param {SlackChannel} channel - Channel as sent by Slack
   * @returns {ChannelRow} Channel row
   */
  private getChannel(channel: SlackChannel): ChannelRow {
    return {
      id: channel.id,
      isMember: channel.is_member ?? false,
      isPrivate: channel.is_private ?? false,
      members: channel.num_members ?? 0,
      name: channel.name ?? '',
      purpose: channel.purpose?.value ?? '',
      topic: channel.topic?.value ?? ''
    };
  }

  /**
   * Downloads a file body from Slack's file host, stopping at the size cap
   *
   * The bot token is sent only to `files.slack.com` over HTTPS. Redirects
   * are followed by hand, at most `maxRedirects` hops, and each new host is
   * checked before the token goes with it.
   *
   * @private
   * @param {string} url - Private download URL from `files.info`
   * @param {number} cap - Largest body accepted, in bytes
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<Buffer>} File body
   * @throws {Error} When a URL is not on Slack's file host, the download fails, redirects loop, or the body passes the cap
   */
  private async getFileBody(url: string, cap: number, signal?: AbortSignal): Promise<Buffer> {
    this.checkRateLimit('files.download');
    const timeout = AbortSignal.timeout(Client.fileTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let target = new URL(url);
    let response: Response | undefined;
    for (let hop = 0; hop <= Client.maxRedirects; hop++) {
      this.checkFileHost(target);
      response = await fetch(target, { headers: { Authorization: `Bearer ${this.botToken}` }, redirect: 'manual', signal: combined });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) {
        break;
      }
      target = new URL(location, target);
      response = undefined;
    }
    if (!response) {
      throw new Error(`Slack file download redirected more than ${Client.maxRedirects} times, stopped`);
    }
    if (!response.ok || !response.body) {
      throw new Error(`Slack file download answered HTTP ${response.status}`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        throw new Error(`File is larger than ${cap / (1024 * 1024)} MB, download stopped`);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Picks how a file of the given type is shown inline
   *
   * @private
   * @param {string} mimetype - File type, e.g. `image/jpeg`
   * @returns {FileDelivery} `image` for pictures the hosts can display, `text` for text types, `resource` otherwise
   */
  private getFileKind(mimetype: string): FileDelivery {
    if (/^image\/(gif|jpeg|png|webp)$/.test(mimetype)) {
      return 'image';
    }
    if (/^text\//.test(mimetype) || /^application\/(csv|javascript|json|x-sh|x-yaml|xml|yaml)$/.test(mimetype)) {
      return 'text';
    }
    return 'resource';
  }

  /**
   * Fetches one file, inline by type or saved locally
   *
   * @private
   * @param {string} fileId - File id, from the `files` of a message
   * @param {boolean} save - Save to `filesDir` instead of returning the content
   * @param {number} budget - Inline bytes still allowed in this call
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<FileResult>} The file, or a `refused` row with the reason
   */
  private async getFileResult(fileId: string, save: boolean, budget: number, signal?: AbortSignal): Promise<FileResult> {
    const refused = (reason: string, file?: SlackFile): FileResult => ({
      delivered: 'refused',
      id: fileId,
      mimetype: file?.mimetype ?? '',
      name: file?.name ?? '',
      reason,
      size: file?.size ?? 0,
      user: file?.user ?? ''
    });
    if (!/^F[A-Z0-9]+$/.test(fileId)) {
      return refused(`Invalid file id, expected an id like 'F0CL8R3M2QY'`);
    }
    const data = await this.request<SlackResponse & { file?: SlackFile }>('files.info', 'GET', { file: fileId }, signal);
    const file = data.file;
    if (!file) {
      return refused(`Slack 'files.info' returned no file`);
    }
    const size = file.size ?? 0;
    const cap = save ? Client.maxFileBytes : Client.maxInlineBytes;
    if (size > cap) {
      return refused(`File is ${Math.ceil(size / (1024 * 1024))} MB, over the ${cap / (1024 * 1024)} MB limit${save ? '' : ' for inline content, `save` allows up to 20 MB'}`, file);
    }
    if (!save && size > budget) {
      return refused(`The files in this call would pass the ${Client.maxTotalBytes / (1024 * 1024)} MB total, fetch this one in its own call`, file);
    }
    const url = file.url_private_download ?? file.url_private;
    if (!url) {
      return refused('File has no download URL', file);
    }
    const body = await this.getFileBody(url, save ? cap : Math.min(cap, budget), signal);
    const row: FileResult = { delivered: 'resource', id: fileId, mimetype: file.mimetype ?? '', name: file.name ?? '', size: body.byteLength, user: file.user ?? '' };
    if (save) {
      const type = file.filetype && /^[a-z0-9]+$/i.test(file.filetype) ? file.filetype.toLowerCase() : 'bin';
      await mkdir(this.filesDir, { recursive: true });
      row.path = join(this.filesDir, `${fileId}.${type}`);
      await writeFile(row.path, body);
      row.delivered = 'saved';
      return row;
    }
    row.delivered = this.getFileKind(row.mimetype);
    if (row.delivered === 'text') {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
        row.text = text.slice(0, Client.maxTextChars);
        row.truncated = text.length > Client.maxTextChars;
        return row;
      } catch {
        row.delivered = 'resource';
      }
    }
    row.data = body.toString('base64');
    return row;
  }

  /**
   * Maps a Slack file to a file row
   *
   * @private
   * @param {SlackFile} file - File as sent by Slack
   * @returns {FileRow} File row
   */
  private getFileRow(file: SlackFile): FileRow {
    return { id: file.id, mimetype: file.mimetype ?? '', name: file.name ?? '', size: file.size ?? 0 };
  }

  /**
   * Maps a Slack message to a message row
   *
   * @private
   * @param {SlackMessage} message - Message as sent by Slack
   * @returns {MessageRow} Message row, optional fields left out when Slack sends none
   */
  private getMessage(message: SlackMessage): MessageRow {
    const row: MessageRow = { text: this.getText(message.text ?? ''), ts: message.ts };
    if (message.bot_id) {
      row.botId = message.bot_id;
    }
    if (message.files && message.files.length > 0) {
      row.files = message.files.map((file) => this.getFileRow(file));
    }
    if (message.reactions && message.reactions.length > 0) {
      row.reactions = message.reactions.map((reaction) => ({
        count: reaction.count ?? reaction.users?.length ?? 0,
        name: reaction.name,
        users: reaction.users ?? []
      }));
    }
    if (message.reply_count !== undefined) {
      row.replyCount = message.reply_count;
    }
    if (message.thread_ts) {
      row.threadTs = message.thread_ts;
    }
    if (message.user) {
      row.user = message.user;
    }
    return row;
  }

  /**
   * Decodes message text for reading
   *
   * Slack escapes only `&`, `<` and `>`, so those three are decoded, `&amp;`
   * last so an escaped entity stays literal. The zero-width spaces that
   * mark formatting boundaries are removed. Link markup like `<url|label>`
   * already uses real angle brackets and is left as is.
   *
   * @private
   * @param {string} text - Text as stored by Slack
   * @returns {string} Readable text
   */
  private getText(text: string): string {
    return text.replace(/​/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  /**
   * Maps a Slack user to a user row
   *
   * @private
   * @param {SlackUser} user - User as sent by Slack
   * @returns {UserRow} User row, with a ready `<@id>` mention
   */
  private getUser(user: SlackUser): UserRow {
    return {
      deleted: user.deleted ?? false,
      displayName: user.profile?.display_name ?? '',
      id: user.id,
      isBot: user.is_bot ?? false,
      mention: `<@${user.id}>`,
      name: user.name ?? '',
      realName: user.real_name ?? user.profile?.real_name ?? '',
      timezone: user.tz ?? ''
    };
  }

  /**
   * Sends one request to the Slack Web API
   *
   * GET requests carry the params in the query string, POST requests in a
   * JSON body. The request stops on the caller's signal or on the timeout.
   *
   * @private
   * @param {string} endpoint - Slack Web API method, e.g. `chat.postMessage`
   * @param {'GET' | 'POST'} method - HTTP method
   * @param {Record<string, unknown>} params - Request parameters
   * @param {AbortSignal} [signal] - Cancellation signal of the tool call
   * @returns {Promise<T>} Parsed Slack answer
   * @throws {Error} When the request fails, the answer is not JSON, or Slack answers `ok: false`
   */
  private async request<T extends SlackResponse>(
    endpoint: string,
    method: 'GET' | 'POST',
    params: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    this.checkRateLimit(endpoint);
    const timeout = AbortSignal.timeout(Client.requestTimeoutMs);
    const init: RequestInit = { headers: this.headers, method, signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
    let url = `${Client.apiUrl}/${endpoint}`;
    if (method === 'GET') {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          query.set(key, String(value));
        }
      }
      url = `${url}?${query}`;
    } else {
      init.body = JSON.stringify(params);
    }
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`Slack '${endpoint}' answered HTTP ${response.status}`);
    }
    const data = (await response.json()) as T;
    if (!data.ok) {
      throw new Error(`Slack '${endpoint}' failed: ${data.error ?? 'unknown_error'}`);
    }
    return data;
  }

  /**
   * Adds an emoji reaction to a message
   *
   * @param {string} channelId - Channel id
   * @param {string} ts - Message timestamp
   * @param {string} reaction - Emoji name without colons
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<ReactionResult>} Reaction added
   */
  async addReaction(channelId: string, ts: string, reaction: string, signal?: AbortSignal): Promise<ReactionResult> {
    const name = reaction.replace(/[^a-zA-Z0-9_+-]/g, '');
    await this.request<SlackResponse>('reactions.add', 'POST', { channel: channelId, name, timestamp: ts }, signal);
    return { channel: channelId, reaction: name, ts };
  }

  /**
   * Replaces the text of a message posted by the bot
   *
   * @param {string} channelId - Channel id
   * @param {string} ts - Message timestamp
   * @param {string} text - New text, already in Slack formatting
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<EditResult>} Edited message
   */
  async editMessage(channelId: string, ts: string, text: string, signal?: AbortSignal): Promise<EditResult> {
    const data = await this.request<SlackResponse & { channel: string; text?: string; ts: string }>(
      'chat.update',
      'POST',
      { channel: channelId, text, ts, unfurl_links: false, unfurl_media: false },
      signal
    );
    return { channel: data.channel, text: this.getText(data.text ?? text), ts: data.ts };
  }

  /**
   * Reads the recent messages of a channel, newest first
   *
   * @param {HistoryOptions} options - Channel, number of messages, and the timestamp to read after
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<MessagesResult>} Messages
   */
  async getChannelHistory(options: HistoryOptions, signal?: AbortSignal): Promise<MessagesResult> {
    const data = await this.request<SlackResponse & { messages?: SlackMessage[] }>(
      'conversations.history',
      'GET',
      { channel: options.channelId, limit: Math.min(options.limit, Client.maxHistory), oldest: options.since },
      signal
    );
    const messages = (data.messages ?? []).map((message) => this.getMessage(message));
    const latestTs = messages.length > 0 ? messages[0].ts : options.since ?? '';
    return { channel: options.channelId, count: messages.length, hasMore: data.has_more ?? false, latestTs, messages };
  }

  /**
   * Lists the public channels, or the configured channel ids when set
   *
   * @param {PageOptions} options - Page size and cursor
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<ChannelsResult>} Channels
   */
  async getChannels(options: PageOptions, signal?: AbortSignal): Promise<ChannelsResult> {
    if (this.channelIds.length > 0) {
      const channels: ChannelRow[] = [];
      for (const id of this.channelIds) {
        const data = await this.request<SlackResponse & { channel: SlackChannel }>('conversations.info', 'GET', { channel: id }, signal);
        if (!data.channel.is_archived) {
          channels.push(this.getChannel(data.channel));
        }
      }
      return { channels, count: channels.length, nextCursor: '' };
    }
    const data = await this.request<SlackResponse & { channels?: SlackChannel[] }>(
      'conversations.list',
      'GET',
      {
        cursor: options.cursor,
        exclude_archived: true,
        limit: Math.min(options.limit, Client.maxChannels),
        team_id: this.teamId,
        types: 'public_channel'
      },
      signal
    );
    const channels = (data.channels ?? []).map((channel) => this.getChannel(channel));
    return { channels, count: channels.length, nextCursor: data.response_metadata?.next_cursor ?? '' };
  }

  /**
   * Fetches files attached to messages, inline by type or saved locally
   *
   * Inline, a file is capped at `maxInlineBytes` and a call at
   * `maxTotalBytes`, since inline content costs context. Saved, a file is
   * capped at `maxFileBytes` and written as `<file id>.<type>`, never under
   * the name the uploader chose, so a name can't leave the folder. A file
   * that can't be fetched comes back `refused` with the reason, and the
   * others still arrive.
   *
   * @param {string[]} fileIds - File ids, from the `files` of messages
   * @param {boolean} save - Save to `filesDir` instead of returning the content
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<FilesResult>} One row per file, in the order asked
   */
  async getFiles(fileIds: string[], save: boolean, signal?: AbortSignal): Promise<FilesResult> {
    const files: FileResult[] = [];
    let budget = Client.maxTotalBytes;
    for (const fileId of fileIds) {
      const row = await this.getFileResult(fileId, save, budget, signal);
      if (row.delivered !== 'refused' && row.delivered !== 'saved') {
        budget -= row.size;
      }
      files.push(row);
    }
    return { files };
  }

  /**
   * Lists the messages pinned to a channel
   *
   * Files and file comments pinned to the channel are left out, since every
   * tool here works on messages.
   *
   * @param {string} channelId - Channel id
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<PinsResult>} Pinned messages, newest pin first
   */
  async getPins(channelId: string, signal?: AbortSignal): Promise<PinsResult> {
    const data = await this.request<SlackResponse & { items?: SlackPin[] }>('pins.list', 'GET', { channel: channelId }, signal);
    const pins = (data.items ?? [])
      .filter((item) => item.type === 'message' && item.message)
      .map((item) => {
        const message = item.message!;
        const row: PinRow = { created: item.created ?? 0, text: this.getText(message.text ?? ''), ts: message.ts };
        if (message.user) {
          row.user = message.user;
        }
        return row;
      })
      .sort((a, b) => b.created - a.created);
    return { channel: channelId, count: pins.length, pins };
  }

  /**
   * Checks the bot token and returns who the bot is
   *
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<StatusResult>} Bot, workspace and server version
   * @throws {Error} When the token is missing a scope, revoked or invalid
   */
  async getStatus(signal?: AbortSignal): Promise<StatusResult> {
    const data = await this.request<SlackResponse & { bot_id?: string; team?: string; team_id?: string; user?: string; user_id?: string }>(
      'auth.test',
      'POST',
      {},
      signal
    );
    return {
      botId: data.bot_id ?? '',
      team: data.team ?? '',
      teamId: data.team_id ?? '',
      user: data.user ?? '',
      userId: data.user_id ?? '',
      version: this.version
    };
  }

  /**
   * Reads the messages of a thread, in the order they were posted
   *
   * The whole thread is fetched page by page, up to `maxHistory` messages,
   * and trimmed here so a long thread never floods the reader. Without
   * `since`, the parent and the last `limit` replies are returned, a first
   * visit. With `since`, the first `limit` messages after that timestamp are
   * returned, so reading again from `latestTs` never skips a message.
   *
   * @param {ThreadOptions} options - Channel, parent timestamp, reply limit, and the timestamp to read after
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<MessagesResult>} Messages in order, with the newest timestamp returned
   */
  async getThreadHistory(options: ThreadOptions, signal?: AbortSignal): Promise<MessagesResult> {
    const since = options.since;
    const rows: MessageRow[] = [];
    let cursor: string | undefined;
    let slackHasMore = false;
    do {
      const data = await this.request<SlackResponse & { messages?: SlackMessage[] }>(
        'conversations.replies',
        'GET',
        { channel: options.channelId, cursor, limit: Client.maxReplyPage, oldest: since, ts: options.threadTs },
        signal
      );
      rows.push(...(data.messages ?? []).map((message) => this.getMessage(message)));
      cursor = data.response_metadata?.next_cursor || undefined;
      slackHasMore = Boolean(cursor) && rows.length >= Client.maxHistory;
    } while (cursor && rows.length < Client.maxHistory);
    let messages: MessageRow[];
    let trimmed: boolean;
    if (since) {
      const fresh = rows.filter((message) => Number(message.ts) > Number(since));
      messages = fresh.slice(0, options.limit);
      trimmed = fresh.length > messages.length;
    } else {
      const replies = rows.slice(1);
      messages = [...rows.slice(0, 1), ...replies.slice(-options.limit)];
      trimmed = replies.length > options.limit;
    }
    const latestTs = messages.length > 0 ? messages[messages.length - 1].ts : since ?? '';
    return { channel: options.channelId, count: messages.length, hasMore: trimmed || slackHasMore, latestTs, messages };
  }

  /**
   * Reads the profile of a user
   *
   * @param {string} userId - User id
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<UserProfileRow>} Profile
   */
  async getUserProfile(userId: string, signal?: AbortSignal): Promise<UserProfileRow> {
    const data = await this.request<
      SlackResponse & { profile?: { display_name?: string; real_name?: string; status_emoji?: string; status_text?: string; title?: string } }
    >('users.profile.get', 'GET', { user: userId }, signal);
    return {
      displayName: data.profile?.display_name ?? '',
      realName: data.profile?.real_name ?? '',
      statusEmoji: data.profile?.status_emoji ?? '',
      statusText: data.profile?.status_text ?? '',
      title: data.profile?.title ?? '',
      userId
    };
  }

  /**
   * Lists the users of the workspace
   *
   * @param {PageOptions} options - Page size and cursor
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<UsersResult>} Users, each with a ready `<@id>` mention
   */
  async getUsers(options: PageOptions, signal?: AbortSignal): Promise<UsersResult> {
    const data = await this.request<SlackResponse & { members?: SlackUser[] }>(
      'users.list',
      'GET',
      { cursor: options.cursor, limit: Math.min(options.limit, Client.maxUsers), team_id: this.teamId },
      signal
    );
    const users = (data.members ?? []).map((user) => this.getUser(user));
    return { count: users.length, nextCursor: data.response_metadata?.next_cursor ?? '', users };
  }

  /**
   * Gets package version
   *
   * @returns {string} Package version
   * @throws {Error} When package.json cannot be read or parsed
   */
  getVersion(): string {
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const packagePath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      return packageJson.version;
    } catch (error) {
      throw new Error(`Failed to read package.json version: ${error}`);
    }
  }

  /**
   * Pins or unpins a message in a channel
   *
   * @param {string} channelId - Channel id
   * @param {string} ts - Message timestamp
   * @param {'add' | 'remove'} action - Pin or unpin
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<PinResult>} Pin applied or removed
   */
  async pinMessage(channelId: string, ts: string, action: 'add' | 'remove', signal?: AbortSignal): Promise<PinResult> {
    await this.request<SlackResponse>(action === 'add' ? 'pins.add' : 'pins.remove', 'POST', { channel: channelId, timestamp: ts }, signal);
    return { action, channel: channelId, ts };
  }

  /**
   * Posts a new message to a channel
   *
   * @param {string} channelId - Channel id
   * @param {string} text - Message text, already in Slack formatting
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<PostResult>} Posted message
   */
  async postMessage(channelId: string, text: string, signal?: AbortSignal): Promise<PostResult> {
    const data = await this.request<SlackResponse & { channel: string; ts: string }>(
      'chat.postMessage',
      'POST',
      { channel: channelId, text, unfurl_links: false, unfurl_media: false },
      signal
    );
    return { channel: data.channel, ts: data.ts };
  }

  /**
   * Posts a reply in a thread
   *
   * @param {string} channelId - Channel id
   * @param {string} threadTs - Parent message timestamp
   * @param {string} text - Reply text, already in Slack formatting
   * @param {boolean} broadcast - Also show the reply in the channel
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<PostResult>} Posted reply, with the parent timestamp Slack placed it under
   */
  async postReply(channelId: string, threadTs: string, text: string, broadcast: boolean, signal?: AbortSignal): Promise<PostResult> {
    const data = await this.request<SlackResponse & { channel: string; message?: { thread_ts?: string }; ts: string }>(
      'chat.postMessage',
      'POST',
      {
        channel: channelId,
        reply_broadcast: broadcast || undefined,
        text,
        thread_ts: threadTs,
        unfurl_links: false,
        unfurl_media: false
      },
      signal
    );
    return { channel: data.channel, threadTs: data.message?.thread_ts ?? threadTs, ts: data.ts };
  }

  /**
   * Removes an emoji reaction the bot added to a message
   *
   * @param {string} channelId - Channel id
   * @param {string} ts - Message timestamp
   * @param {string} reaction - Emoji name without colons
   * @param {AbortSignal} [signal] - Cancellation signal
   * @returns {Promise<ReactionResult>} Reaction removed
   */
  async removeReaction(channelId: string, ts: string, reaction: string, signal?: AbortSignal): Promise<ReactionResult> {
    const name = reaction.replace(/[^a-zA-Z0-9_+-]/g, '');
    await this.request<SlackResponse>('reactions.remove', 'POST', { channel: channelId, name, timestamp: ts }, signal);
    return { channel: channelId, reaction: name, ts };
  }
}
