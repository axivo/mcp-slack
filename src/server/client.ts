/**
 * Secure Slack API client
 * 
 * @module server/client
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const slackApi = 'https://slack.com/api';
const suspiciousDomains = [
  'bit.ly',
  'goo.gl',
  'ngrok.com',
  'ngrok.io',
  'tinyurl.com'
];

/**
 * Slack API client
 * 
 * Provides secure Slack API operations with rate limiting, content sanitization,
 * and URL validation for safe workspace interactions.
 * 
 * @class SlackClient
 */
export class SlackClient {
  private botHeaders: { Authorization: string; "Content-Type": string };
  private rateLimiter: Map<string, number> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000;
  private readonly RATE_LIMIT_MAX_REQUESTS = 60;
  private userCache: Map<string, any> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 300000;

  /**
   * Creates a new SlackClient instance
   * 
   * @param {string} botToken - Slack bot token for API authentication
   */
  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Checks and enforces rate limiting for API endpoints
   * 
   * @private
   * @param {string} endpoint - API endpoint to check rate limit for
   * @returns {boolean} True if within rate limit
   * @throws {Error} When rate limit is exceeded
   */
  private checkRateLimit(endpoint: string): boolean {
    const now = Date.now();
    const key = `${endpoint}_${Math.floor(now / this.RATE_LIMIT_WINDOW)}`;
    const current = this.rateLimiter.get(key) || 0;
    if (current >= this.RATE_LIMIT_MAX_REQUESTS) {
      throw new Error(`Rate limit exceeded for ${endpoint}`);
    }
    this.rateLimiter.set(key, current + 1);
    for (const [k, _] of this.rateLimiter) {
      if (k < key) {
        this.rateLimiter.delete(k);
      }
    }
    return true;
  }

  /**
   * Converts GitHub Flavored Markdown to Slack mrkdwn format
   * 
   * @private
   * @param {string} text - Text content with GitHub markdown formatting
   * @returns {string} Text converted to Slack mrkdwn format
   */
  private formatText(text: string): string {
    return text
      .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
      .replace(/\*\*(.*?)\*\*/g, '*$1*')
      .replace(/__(.*?)__/g, '*$1*')
      .replace(/(?<!\*)\*(.*?)\*(?!\*)/g, '_$1_')
      .replace(/~~(.*?)~~/g, '~$1~')
      .replace(/^[-*+]\s+/gm, '• ')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>')
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, 'Image: <$2|$1>')
      .replace(/```[\w]*\n/g, '```\n')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^---+$/gm, '━━━━━━━━━━')
      .replace(/^- \[(x| )\] /gm, '• ')
      .replace(/\[\^[^\]]+\]/g, '')
      .replace(/^\[\^[^\]]+\]:[^\n]+\n?/gm, '')
      .replace(/\$([^$]+)\$/g, '$1')
      .replace(/\$\$([^$]+)\$\$/g, '$1');
  }

  /**
   * Gets cached user data or fetches from Slack API
   * 
   * @private
   * @returns {Promise<Map<string, any>>} Map of display names to user data
   */
  private async getCachedUsers(): Promise<Map<string, any>> {
    const now = Date.now();
    if (this.userCache.size > 0 && now < this.cacheExpiry) {
      return this.userCache;
    }
    try {
      const response = await this.getUsers(200);
      if (response.ok && response.members) {
        this.userCache.clear();
        for (const user of response.members) {
          if (!user.deleted) {
            const realName = user.real_name?.toLowerCase();
            const displayName = user.profile?.display_name?.toLowerCase();
            const username = user.name?.toLowerCase();
            if (realName) {
              this.userCache.set(realName, user);
            }
            if (displayName && displayName !== realName) {
              this.userCache.set(displayName, user);
            }
            if (username) {
              this.userCache.set(username, user);
            }
          }
        }
        this.cacheExpiry = now + this.CACHE_DURATION;
      }
    } catch (error) {
      console.warn('Failed to cache users for mention resolution:', error);
    }
    return this.userCache;
  }

  /**
   * Resolves display name mentions to username mentions
   * 
   * @private
   * @param {string} text - Text content containing potential mentions
   * @returns {Promise<string>} Text with resolved mentions
   */
  private async resolveMentions(text: string): Promise<string> {
    const mentionRegex = /@([A-Za-z][A-Za-z\s]*[A-Za-z]|[A-Za-z])/g;
    const matches = text.match(mentionRegex);
    if (!matches) {
      return text;
    }
    try {
      const userCache = await this.getCachedUsers();
      let resolvedText = text;
      for (const match of matches) {
        const displayName = match.substring(1).toLowerCase().trim();
        const user = userCache.get(displayName);
        if (user && user.name) {
          resolvedText = resolvedText.replace(match, `@${user.name}`);
        }
      }
      return resolvedText;
    } catch (error) {
      console.warn('Failed to resolve mentions, using original text:', error);
      return text;
    }
  }

  /**
   * Sanitizes text content to remove potentially malicious scripts and content
   * 
   * @private
   * @param {string} text - Text content to sanitize
   * @returns {Promise<string>} Sanitized text with malicious content removed and mentions resolved
   */
  private async sanitizeText(text: string): Promise<string> {
    this.validateUrls(text);
    const formatted = this.formatText(text);
    const sanitized = formatted
      .replace(/<script[^>]*>.*?<\/script>/gi, '[SCRIPT_REMOVED]')
      .replace(/javascript:/gi, '[JAVASCRIPT_REMOVED]')
      .replace(/data:text\/html/gi, '[DATA_URL_REMOVED]');
    if (sanitized !== formatted) {
      console.warn('Potentially malicious content sanitized:', {
        original: formatted.substring(0, 100),
        sanitized: sanitized.substring(0, 100)
      });
    }
    return await this.resolveMentions(sanitized);
  }

  /**
   * Validates URLs in text content for security threats
   * 
   * @private
   * @param {string} text - Text content containing URLs to validate
   * @throws {Error} When suspicious domains or non-standard ports are detected
   */
  private validateUrls(text: string): void {
    const domains = process.env.SLACK_SUSPICIOUS_DOMAINS
      ? process.env.SLACK_SUSPICIOUS_DOMAINS.split(',').map(domain => domain.trim())
      : suspiciousDomains;
    const directUrlRegex = /https?:\/\/[^\s)]+/gi;
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const urls: string[] = [];
    urls.push(...(text.match(directUrlRegex) || []));
    let markdownMatch;
    while ((markdownMatch = markdownLinkRegex.exec(text)) !== null) {
      urls.push(markdownMatch[2]);
    }
    for (const url of urls) {
      try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname.toLowerCase();
        if (domains.some(sus => domain.includes(sus))) {
          throw new Error(`Suspicious domain detected: ${domain}`);
        }
        const allowedPorts = ['80', '443', '8080', '8443'];
        if (parsedUrl.port && !allowedPorts.includes(parsedUrl.port)) {
          throw new Error(`Non-standard port detected: ${parsedUrl.port}`);
        }
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error(`Invalid URL detected: ${url}`);
        }
        throw error;
      }
    }
  }

  /**
   * Adds a reaction emoji to a message
   * 
   * @param {string} channel_id - The ID of the channel containing the message
   * @param {string} timestamp - The timestamp of the message to react to
   * @param {string} reaction - The name of the emoji reaction (without ::)
   * @returns {Promise<any>} Slack API response
   */
  async addReaction(
    channel_id: string,
    timestamp: string,
    reaction: string,
  ): Promise<any> {
    this.checkRateLimit('addReaction');
    const sanitizedReaction = reaction.replace(/[^a-zA-Z0-9_]/g, '');
    const response = await fetch(`${slackApi}/reactions.add`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        timestamp: timestamp,
        name: sanitizedReaction,
      }),
    });
    return response.json();
  }

  /**
   * Edits an existing message in a Slack channel
   * 
   * @param {string} channel_id - The ID of the channel containing the message
   * @param {string} timestamp - The timestamp of the message to edit
   * @param {string} text - The new message text
   * @returns {Promise<any>} Slack API response
   */
  async editMessage(
    channel_id: string,
    timestamp: string,
    text: string,
  ): Promise<any> {
    this.checkRateLimit('editMessage');
    const sanitizedText = await this.sanitizeText(text);
    const response = await fetch(`${slackApi}/chat.update`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        ts: timestamp,
        text: sanitizedText,
        unfurl_links: false,
        unfurl_media: false,
        parse: "full",
        link_names: false,
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      console.error('Slack API error:', result.error);
    }
    return result;
  }

  /**
   * Gets recent messages from a channel
   * 
   * @param {string} channel_id - The ID of the channel
   * @param {number} [limit=10] - Number of messages to retrieve (max 1000)
   * @returns {Promise<any>} Slack API response with channel history
   */
  async getChannelHistory(
    channel_id: string,
    limit: number = 10,
  ): Promise<any> {
    this.checkRateLimit('getChannelHistory');
    const params = new URLSearchParams({
      channel: channel_id,
      limit: Math.min(limit, 1000).toString(),
    });
    const response = await fetch(
      `${slackApi}/conversations.history?${params}`,
      { headers: this.botHeaders },
    );
    return response.json();
  }

  /**
   * Gets information about a specific channel
   * 
   * @param {string} channel_id - The ID of the channel
   * @returns {Promise<any>} Slack API response with channel information
   */
  async getChannelInfo(channel_id: string): Promise<any> {
    this.checkRateLimit('getChannelInfo');
    const params = new URLSearchParams({
      channel: channel_id,
    });
    const response = await fetch(
      `${slackApi}/conversations.info?${params}`,
      { headers: this.botHeaders },
    );
    const result = await response.json();
    return result.ok ? result.channel : null;
  }

  /**
   * Lists public or pre-defined channels in the workspace
   * 
   * @param {number} [limit=100] - Maximum number of channels to return (max 200)
   * @param {string} [cursor] - Pagination cursor for next page of results
   * @returns {Promise<any>} Slack API response with channel list
   */
  async getChannels(limit: number = 100, cursor?: string): Promise<any> {
    this.checkRateLimit('getChannels');
    const predefinedChannelIds = process.env.SLACK_CHANNEL_IDS;
    if (!predefinedChannelIds) {
      const params = new URLSearchParams({
        types: 'public_channel',
        exclude_archived: 'true',
        limit: Math.min(limit, 200).toString(),
        team_id: process.env.SLACK_TEAM_ID!,
      });
      if (cursor) {
        params.append("cursor", cursor);
      }
      const response = await fetch(
        `${slackApi}/conversations.list?${params}`,
        { headers: this.botHeaders },
      );
      return response.json();
    }
    const predefinedChannelIdsArray = predefinedChannelIds.split(',').map((id: string) => id.trim());
    const channels = [];
    for (const channelId of predefinedChannelIdsArray) {
      const params = new URLSearchParams({
        channel: channelId,
      });
      const response = await fetch(
        `${slackApi}/conversations.info?${params}`,
        { headers: this.botHeaders }
      );
      const data = await response.json();
      if (data.ok && data.channel && !data.channel.is_archived) {
        channels.push(data.channel);
      }
    }
    return {
      ok: true,
      channels: channels,
      response_metadata: { next_cursor: '' },
    };
  }

  /**
   * Gets all replies in a message thread
   * 
   * @param {string} channel_id - The ID of the channel containing the thread
   * @param {string} thread_ts - The timestamp of the parent message
   * @returns {Promise<any>} Slack API response with thread replies
   */
  async getThreadReplies(channel_id: string, thread_ts: string): Promise<any> {
    this.checkRateLimit('getThreadReplies');
    const params = new URLSearchParams({
      channel: channel_id,
      ts: thread_ts,
    });
    const response = await fetch(
      `${slackApi}/conversations.replies?${params}`,
      { headers: this.botHeaders },
    );
    return response.json();
  }

  /**
   * Gets basic information about a specific user
   * 
   * @param {string} user_id - The ID of the user
   * @returns {Promise<any>} Slack API response with user information
   */
  async getUserInfo(user_id: string): Promise<any> {
    this.checkRateLimit('getUserInfo');
    const params = new URLSearchParams({
      user: user_id,
    });
    const response = await fetch(
      `${slackApi}/users.info?${params}`,
      { headers: this.botHeaders },
    );
    const result = await response.json();
    return result.ok ? result.user : null;
  }

  /**
   * Gets detailed profile information for a specific user
   * 
   * @param {string} user_id - The ID of the user
   * @returns {Promise<any>} Slack API response with user profile information
   */
  async getUserProfile(user_id: string): Promise<any> {
    this.checkRateLimit('getUserProfile');
    const params = new URLSearchParams({
      user: user_id,
      include_labels: 'true',
    });
    const response = await fetch(
      `${slackApi}/users.profile.get?${params}`,
      { headers: this.botHeaders },
    );
    return response.json();
  }

  /**
   * Gets a list of all users in the workspace
   * 
   * @param {number} [limit=100] - Maximum number of users to return (max 200)
   * @param {string} [cursor] - Pagination cursor for next page of results
   * @returns {Promise<any>} Slack API response with user list
   */
  async getUsers(limit: number = 100, cursor?: string): Promise<any> {
    this.checkRateLimit('getUsers');
    const params = new URLSearchParams({
      limit: Math.min(limit, 200).toString(),
      team_id: process.env.SLACK_TEAM_ID!,
    });
    if (cursor) {
      params.append("cursor", cursor);
    }
    const response = await fetch(`${slackApi}/users.list?${params}`, {
      headers: this.botHeaders,
    });
    return response.json();
  }

  /**
   * Posts a new message to a Slack channel
   * 
   * @param {string} channel_id - The ID of the channel to post to
   * @param {string} text - The message text to post
   * @returns {Promise<any>} Slack API response with posted message details
   */
  async postMessage(channel_id: string, text: string): Promise<any> {
    this.checkRateLimit('postMessage');
    const sanitizedText = await this.sanitizeText(text);
    const response = await fetch(`${slackApi}/chat.postMessage`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        text: sanitizedText,
        unfurl_links: false,
        unfurl_media: false,
        parse: "full",
        link_names: false,
      }),
    });
    const result = await response.json();
    if (!result.ok) {
      console.error('Slack API error:', result.error);
    }
    return result;
  }

  /**
   * Replies to a specific message thread in Slack
   * 
   * @param {string} channel_id - The ID of the channel containing the thread
   * @param {string} thread_ts - The timestamp of the parent message
   * @param {string} text - The reply text
   * @param {boolean} [broadcast=false] - Whether to also send the reply to the main channel
   * @returns {Promise<any>} Slack API response with posted reply details
   */
  async postReply(
    channel_id: string,
    thread_ts: string,
    text: string,
    broadcast: boolean = false,
  ): Promise<any> {
    this.checkRateLimit('postReply');
    const sanitizedText = await this.sanitizeText(text);
    const body: any = {
      channel: channel_id,
      thread_ts: thread_ts,
      text: sanitizedText,
      unfurl_links: false,
      unfurl_media: false,
      parse: "full",
      link_names: false,
    };
    if (broadcast) {
      body.reply_broadcast = true;
    }
    const response = await fetch(`${slackApi}/chat.postMessage`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify(body),
    });
    return response.json();
  }

  /**
   * Gets package version
   * 
   * @returns {string} Package version
   * @throws {Error} When package.json cannot be read or parsed
   */
  version(): string {
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
}
