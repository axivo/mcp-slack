/**
 * MCP Tool Definitions for Slack Integration
 * 
 * @module server/tool
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP Tool Definitions for Slack API Integration
 * 
 * Provides comprehensive MCP tool definitions that bridge Slack API capabilities
 * with Model Context Protocol, enabling Claude agents to interact with Slack workspaces.
 * 
 * @class McpTool
 */
export class McpTool {
  private users: number;

  /**
   * Creates a new McpTool instance with pagination configuration
   * 
   * Initializes tool definitions with consistent pagination limits
   * for all tools that support result pagination.
   * 
   * @param {number} users - Default pagination limit for user-related results
   */
  constructor(users: number) {
    this.users = users;
  }

  /**
   * Creates MCP tool for adding reaction emojis to messages
   * 
   * Enables adding emoji reactions to Slack messages for engagement
   * and quick responses without full message replies.
   * 
   * @returns {Tool} MCP tool definition for adding reactions
   */
  addReaction(): Tool {
    return {
      name: 'add_reaction',
      description: 'Add a reaction emoji to a message',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the message' },
          timestamp: { type: 'string', description: 'The timestamp of the message to react to' },
          reaction: { type: 'string', description: 'The name of the emoji reaction (without ::)' }
        },
        required: ['channel_id', 'timestamp', 'reaction']
      }
    };
  }

  /**
   * Creates MCP tool for editing existing messages
   * 
   * Allows modification of previously posted messages in Slack channels,
   * supporting content updates and corrections.
   * 
   * @returns {Tool} MCP tool definition for message editing
   */
  editMessage(): Tool {
    return {
      name: 'edit_message',
      description: 'Edit an existing message in a Slack channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the message' },
          timestamp: { type: 'string', description: 'The timestamp of the message to edit' },
          text: { type: 'string', description: 'The message text to edit' }
        },
        required: ['channel_id', 'timestamp', 'text']
      }
    };
  }

  /**
   * Creates MCP tool for retrieving channel message history
   * 
   * Provides access to recent messages in Slack channels with pagination
   * support for browsing conversation history and context.
   * 
   * @returns {Tool} MCP tool definition for channel history retrieval
   */
  getChannelHistory(): Tool {
    return {
      name: 'get_channel_history',
      description: 'Get recent messages from a channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel' },
          limit: { type: 'number', description: 'Number of messages to retrieve (default: 10)', default: 10 }
        },
        required: ['channel_id']
      }
    };
  }

  /**
   * Creates MCP tool for getting thread replies
   * 
   * Retrieves all replies within a specific message thread for
   * comprehensive conversation context and thread management.
   * 
   * @returns {Tool} MCP tool definition for thread reply retrieval
   */
  getThreadReplies(): Tool {
    return {
      name: 'get_thread_replies',
      description: 'Get all replies in a message thread',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the thread' },
          thread_ts: { type: 'string', description: 'The timestamp of the parent message (format: 1234567890.123456)' }
        },
        required: ['channel_id', 'thread_ts']
      }
    };
  }

  /**
   * Aggregates all available MCP tools into comprehensive registry
   * 
   * Returns complete collection of Slack-to-MCP tool definitions including
   * messaging, user management, and workspace operations.
   * 
   * @returns {Tool[]} Complete array of all available MCP tool definitions
   */
  getTools(): Tool[] {
    return [
      this.addReaction(),
      this.editMessage(),
      this.getChannelHistory(),
      this.getThreadReplies(),
      this.getUserProfile(),
      this.getUsers(),
      this.listChannels(),
      this.postMessage(),
      this.replyToThread()
    ];
  }

  /**
   * Creates MCP tool for getting detailed user profile information
   * 
   * Provides comprehensive user profile data including display names,
   * status, timezone, and custom fields for user identification.
   * 
   * @returns {Tool} MCP tool definition for user profile retrieval
   */
  getUserProfile(): Tool {
    return {
      name: 'get_user_profile',
      description: 'Get detailed profile information for a specific user',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'The ID of the user' }
        },
        required: ['user_id']
      }
    };
  }

  /**
   * Creates MCP tool for listing workspace users with pagination
   * 
   * Enumerates all users in the Slack workspace with pagination support
   * for large teams and comprehensive user directory access.
   * 
   * @returns {Tool} MCP tool definition for user listing
   */
  getUsers(): Tool {
    return {
      name: 'get_users',
      description: 'Get a list of all users in the workspace with their basic profile information',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Pagination cursor for next page of results' },
          limit: { type: 'number', description: 'Maximum number of users to return (default: 100, max: 200)', default: this.users }
        }
      }
    };
  }

  /**
   * Creates MCP tool for listing Slack channels with pagination
   * 
   * Provides access to public channels and predefined channel lists
   * with pagination support for workspace navigation.
   * 
   * @returns {Tool} MCP tool definition for channel listing
   */
  listChannels(): Tool {
    return {
      name: 'list_channels',
      description: 'List public or pre-defined channels in the workspace with pagination',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of channels to return (default: 100, max: 200)', default: this.users },
          cursor: { type: 'string', description: 'Pagination cursor for next page of results' }
        }
      }
    };
  }

  /**
   * Creates MCP tool for posting messages to Slack channels
   * 
   * Enables sending new messages to Slack channels with markdown support
   * and proper formatting for effective communication.
   * 
   * @returns {Tool} MCP tool definition for message posting
   */
  postMessage(): Tool {
    return {
      name: 'post_message',
      description: 'Post a new message to a Slack channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel to post to' },
          text: { type: 'string', description: 'The message text to post' }
        },
        required: ['channel_id', 'text']
      }
    };
  }

  /**
   * Creates MCP tool for replying to message threads
   * 
   * Allows posting replies within existing message threads with optional
   * broadcasting to maintain organized conversations.
   * 
   * @returns {Tool} MCP tool definition for thread replies
   */
  replyToThread(): Tool {
    return {
      name: 'reply_to_thread',
      description: 'Reply to a specific message thread in Slack',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the thread' },
          thread_ts: { type: 'string', description: 'The timestamp of the parent message (format: 1234567890.123456)' },
          text: { type: 'string', description: 'The reply text to post' },
          broadcast: { type: 'boolean', description: 'Whether to also send the reply to the main channel (default: false)', default: false }
        },
        required: ['channel_id', 'thread_ts', 'text']
      }
    };
  }
}
