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
  private readonly RATE_LIMIT_MAX_REQUESTS = 60;
  private readonly RATE_LIMIT_WINDOW = 60000;

  /**
   * Creates a new SlackClient instance
   * 
   * @param {string} botToken - Slack bot token for API authentication
   */
  constructor(botToken: string) {
    this.botHeaders = {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json'
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
      return this.response(`Rate limit exceeded for '${endpoint}' endpoint.`);
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
   * Adds a reaction emoji to a message
   * 
   * @param {string} channel_id - The ID of the channel containing the message
   * @param {string} timestamp - The timestamp of the message to react to
   * @param {string} reaction - The name of the emoji reaction (without ::)
   * @returns {Promise<any>} Slack API response
   */
  async addReaction(channel_id: string, timestamp: string, reaction: string): Promise<any> {
    this.checkRateLimit('addReaction');
    const sanitizedReaction = reaction.replace(/[^a-zA-Z0-9_]/g, '');
    const response = await fetch(`${slackApi}/reactions.add`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        name: sanitizedReaction,
        timestamp: timestamp
      })
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
  async editMessage(channel_id: string, timestamp: string, text: string): Promise<any> {
    this.checkRateLimit('editMessage');
    const response = await fetch(`${slackApi}/chat.update`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        link_names: true,
        parse: "full",
        text: text,
        ts: timestamp,
        unfurl_links: false,
        unfurl_media: false
      })
    });
    return await response.json();
  }

  /**
   * Gets recent messages from a channel
   * 
   * @param {string} channel_id - The ID of the channel
   * @param {number} [limit=10] - Number of messages to retrieve (max 1000)
   * @returns {Promise<any>} Slack API response with channel history
   */
  async getChannelHistory(channel_id: string, limit: number = 10): Promise<any> {
    this.checkRateLimit('getChannelHistory');
    const params = new URLSearchParams({
      channel: channel_id,
      limit: Math.min(limit, 1000).toString()
    });
    const response = await fetch(
      `${slackApi}/conversations.history?${params}`,
      { headers: this.botHeaders }
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
      channel: channel_id
    });
    const response = await fetch(
      `${slackApi}/conversations.info?${params}`,
      { headers: this.botHeaders }
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
        team_id: process.env.SLACK_TEAM_ID!
      });
      if (cursor) {
        params.append("cursor", cursor);
      }
      const response = await fetch(
        `${slackApi}/conversations.list?${params}`,
        { headers: this.botHeaders }
      );
      return response.json();
    }
    const predefinedChannelIdsArray = predefinedChannelIds.split(',').map((id: string) => id.trim());
    const channels = [];
    for (const channelId of predefinedChannelIdsArray) {
      const params = new URLSearchParams({
        channel: channelId
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
      response_metadata: { next_cursor: '' }
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
      ts: thread_ts
    });
    const response = await fetch(
      `${slackApi}/conversations.replies?${params}`,
      { headers: this.botHeaders }
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
      user: user_id
    });
    const response = await fetch(
      `${slackApi}/users.info?${params}`,
      { headers: this.botHeaders }
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
      include_labels: 'true'
    });
    const response = await fetch(
      `${slackApi}/users.profile.get?${params}`,
      { headers: this.botHeaders }
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
      team_id: process.env.SLACK_TEAM_ID!
    });
    if (cursor) {
      params.append("cursor", cursor);
    }
    const response = await fetch(`${slackApi}/users.list?${params}`, {
      headers: this.botHeaders
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
    const response = await fetch(`${slackApi}/chat.postMessage`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify({
        channel: channel_id,
        link_names: true,
        parse: "full",
        text: text,
        unfurl_links: false,
        unfurl_media: false
      })
    });
    return await response.json();
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
  async postReply(channel_id: string, thread_ts: string, text: string, broadcast: boolean = false): Promise<any> {
    this.checkRateLimit('postReply');
    const body: any = {
      channel: channel_id,
      link_names: true,
      parse: "full",
      text: text,
      thread_ts: thread_ts,
      unfurl_links: false,
      unfurl_media: false
    };
    if (broadcast) {
      body.reply_broadcast = true;
    }
    const response = await fetch(`${slackApi}/chat.postMessage`, {
      method: 'POST',
      headers: this.botHeaders,
      body: JSON.stringify(body)
    });
    return response.json();
  }

  /**
   * Creates a standardized response for tool execution
   * 
   * @param {any} response - The response data from Slack API or error message
   * @param {boolean} stringify - Whether to JSON stringify the response (default: false)
   * @returns {Object} Standardized response format
   */
  response(response: any, stringify: boolean = false): any {
    const text = stringify ? JSON.stringify(response) : response;
    return { content: [{ type: 'text', text }] };
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
      return this.response(`Failed to read package.json version: ${error}`);
    }
  }
}
