/**
 * Slack MCP Server implementation
 * 
 * @module server/mcp
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import slackifyMarkdown from 'slackify-markdown';
import { SlackClient } from './client.js';

interface AddReactionArgs {
  channel_id: string;
  timestamp: string;
  reaction: string;
}

interface EditMessageArgs {
  channel_id: string;
  timestamp: string;
  text: string;
}

interface GetChannelHistoryArgs {
  channel_id: string;
  limit?: number;
}

interface GetThreadRepliesArgs {
  channel_id: string;
  thread_ts: string;
}

interface GetUserProfileArgs {
  user_id: string;
}

interface GetUsersArgs {
  limit?: number;
  cursor?: string;
}

interface ListChannelsArgs {
  limit?: number;
  cursor?: string;
}

interface PostMessageArgs {
  channel_id: string;
  text: string;
}

interface ReplyToThreadArgs {
  channel_id: string;
  thread_ts: string;
  text: string;
  broadcast?: boolean;
}

type ToolHandler = (args: any) => Promise<any>;

/**
 * Slack MCP Server implementation
 * 
 * @class SlackMcpServer
 */
export class SlackMcpServer {
  private client: SlackClient;
  private server: Server;
  private toolHandlers: Map<string, ToolHandler>;
  private transport?: StdioServerTransport;

  /**
   * Creates a new SlackMcpServer instance
   * 
   * @param {string} botToken - Slack bot token for API authentication
   */
  constructor(botToken: string) {
    this.client = new SlackClient(botToken);
    this.server = new Server(
      { name: 'slack', version: this.client.version() },
      { capabilities: { tools: {} } }
    );
    this.toolHandlers = new Map<string, ToolHandler>();
    this.setupToolHandlers();
    this.setupHandlers();
  }

  /**
   * Tool definition for adding reaction emojis to messages
   * 
   * @private
   * @returns {Tool} Add reaction tool definition
   */
  private addReactionTool(): Tool {
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
   * Tool definition for editing existing messages
   * 
   * @private
   * @returns {Tool} Edit message tool definition
   */
  private editMessageTool(): Tool {
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
   * Tool definition for retrieving channel message history
   * 
   * @private
   * @returns {Tool} Channel history tool definition
   */
  private getChannelHistoryTool(): Tool {
    return {
      name: 'get_channel_history',
      description: 'Get recent messages from a channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel' },
          limit: { type: 'number', description: 'Number of messages to retrieve (default 10)', default: 10 }
        },
        required: ['channel_id']
      }
    };
  }

  /**
   * Tool definition for getting thread replies
   * 
   * @private
   * @returns {Tool} Thread replies tool definition
   */
  private getThreadRepliesTool(): Tool {
    return {
      name: 'get_thread_replies',
      description: 'Get all replies in a message thread',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the thread' },
          thread_ts: { type: 'string', description: 'The timestamp of the parent message in the format `1234567890.123456`, timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it' }
        },
        required: ['channel_id', 'thread_ts']
      }
    };
  }

  /**
   * Returns all available MCP tools
   * 
   * @private
   * @returns {Tool[]} Array of MCP tool definitions
   */
  private getTools(): Tool[] {
    return [
      this.addReactionTool(),
      this.editMessageTool(),
      this.getChannelHistoryTool(),
      this.getThreadRepliesTool(),
      this.getUserProfileTool(),
      this.getUsersTool(),
      this.listChannelsTool(),
      this.postMessageTool(),
      this.replyToThreadTool()
    ];
  }

  /**
   * Tool definition for getting detailed user profile information
   * 
   * @private
   * @returns {Tool} User profile tool definition
   */
  private getUserProfileTool(): Tool {
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
   * Tool definition for listing workspace users
   * 
   * @private
   * @returns {Tool} Users list tool definition
   */
  private getUsersTool(): Tool {
    return {
      name: 'get_users',
      description: 'Get a list of all users in the workspace with their basic profile information',
      inputSchema: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Pagination cursor for next page of results' },
          limit: { type: 'number', description: 'Maximum number of users to return (default 100, max 200)', default: 100 }
        }
      }
    };
  }

  /**
   * Handles add reaction tool requests
   * 
   * @private
   * @param {AddReactionArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleAddReaction(args: AddReactionArgs): Promise<any> {
    if (!args.channel_id || !args.timestamp || !args.reaction) {
      return 'Missing required arguments: channel_id, timestamp, and reaction';
    }
    const response = await this.client.addReaction(args.channel_id, args.timestamp, args.reaction);
    return response;
  }

  /**
   * Handles edit message tool requests
   * 
   * @private
   * @param {EditMessageArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleEditMessage(args: EditMessageArgs): Promise<any> {
    if (!args.channel_id || !args.timestamp || !args.text) {
      return 'Missing required arguments: channel_id, timestamp, and text';
    }
    const convertedText = slackifyMarkdown(args.text);
    const response = await this.client.editMessage(args.channel_id, args.timestamp, convertedText);
    return response;
  }

  /**
   * Handles get channel history tool requests
   * 
   * @private
   * @param {GetChannelHistoryArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleGetChannelHistory(args: GetChannelHistoryArgs): Promise<any> {
    if (!args.channel_id) {
      return 'Missing required argument: channel_id';
    }
    const response = await this.client.getChannelHistory(args.channel_id, args.limit);
    return response;
  }

  /**
   * Handles get thread replies tool requests
   * 
   * @private
   * @param {GetThreadRepliesArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleGetThreadReplies(args: GetThreadRepliesArgs): Promise<any> {
    if (!args.channel_id || !args.thread_ts) {
      return 'Missing required arguments: channel_id and thread_ts';
    }
    const response = await this.client.getThreadReplies(args.channel_id, args.thread_ts);
    return response;
  }

  /**
   * Handles get user profile tool requests
   * 
   * @private
   * @param {GetUserProfileArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleGetUserProfile(args: GetUserProfileArgs): Promise<any> {
    if (!args.user_id) {
      return 'Missing required argument: user_id';
    }
    const response = await this.client.getUserProfile(args.user_id);
    return response;
  }

  /**
   * Handles get users tool requests
   * 
   * @private
   * @param {GetUsersArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleGetUsers(args: GetUsersArgs): Promise<any> {
    const response = await this.client.getUsers(args.limit, args.cursor);
    if (response.members) {
      response.members = response.members.map((user: any) => ({
        ...user,
        mention: `@${user.name}`
      }));
    }
    return response;
  }

  /**
   * Handles list channels tool requests
   * 
   * @private
   * @param {ListChannelsArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleListChannels(args: ListChannelsArgs): Promise<any> {
    const response = await this.client.getChannels(args.limit, args.cursor);
    return response;
  }

  /**
   * Handles post message tool requests
   * 
   * @private
   * @param {PostMessageArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handlePostMessage(args: PostMessageArgs): Promise<any> {
    if (!args.channel_id || !args.text) {
      return 'Missing required arguments: channel_id and text';
    }
    const convertedText = slackifyMarkdown(args.text);
    const response = await this.client.postMessage(args.channel_id, convertedText);
    return response;
  }

  /**
   * Handles reply to thread tool requests
   * 
   * @private
   * @param {ReplyToThreadArgs} args - Tool arguments
   * @returns {Promise<any>} Tool execution response
   */
  private async handleReplyToThread(args: ReplyToThreadArgs): Promise<any> {
    if (!args.channel_id || !args.thread_ts || !args.text) {
      return 'Missing required arguments: channel_id, thread_ts, and text';
    }
    const convertedText = slackifyMarkdown(args.text);
    const response = await this.client.postReply(args.channel_id, args.thread_ts, convertedText, args.broadcast);
    return response;
  }

  /**
   * Handles tool execution requests from MCP clients
   * 
   * @private
   * @param {CallToolRequest} request - The tool execution request
   * @returns {Promise<Object>} Response containing tool execution results
   */
  private async handleRequest(request: CallToolRequest): Promise<any> {
    if (!request.params.arguments) {
      return 'No arguments provided';
    }
    const handler = this.toolHandlers.get(request.params.name);
    if (!handler) {
      return `Unknown tool: ${request.params.name}`;
    }
    const result = await handler(request.params.arguments);
    return this.client.response(result, typeof result === 'string' ? false : true);
  }

  /**
   * Handles tool listing requests from MCP clients
   * 
   * @private
   * @returns {Promise<Object>} Response containing available tools
   */
  private async handleTools(): Promise<any> {
    return { tools: this.getTools() };
  }

  /**
   * Tool definition for listing Slack channels
   * 
   * @private
   * @returns {Tool} List channels tool definition
   */
  private listChannelsTool(): Tool {
    return {
      name: 'list_channels',
      description: 'List public or pre-defined channels in the workspace with pagination',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Maximum number of channels to return (default 100, max 200)', default: 100 },
          cursor: { type: 'string', description: 'Pagination cursor for next page of results' }
        }
      }
    };
  }

  /**
   * Tool definition for posting messages to Slack channels
   * 
   * @private
   * @returns {Tool} Post message tool definition
   */
  private postMessageTool(): Tool {
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
   * Tool definition for replying to message threads in Slack
   * 
   * @private
   * @returns {Tool} Reply to thread tool definition
   */
  private replyToThreadTool(): Tool {
    return {
      name: 'reply_to_thread',
      description: 'Reply to a specific message thread in Slack',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'The ID of the channel containing the thread' },
          thread_ts: { type: 'string', description: 'The timestamp of the parent message in the format \'1234567890.123456\'. Timestamps in the format without the period can be converted by adding the period such that 6 numbers come after it.' },
          text: { type: 'string', description: 'The reply text to post' },
          broadcast: { type: 'boolean', description: 'Whether to also send the reply to the main channel (default: false)', default: false }
        },
        required: ['channel_id', 'thread_ts', 'text']
      }
    };
  }

  /**
   * Sets up MCP request handlers for tool execution and tool listing
   * 
   * @private
   */
  private setupHandlers(): void {
    this.server.setRequestHandler(CallToolRequestSchema, this.handleRequest.bind(this));
    this.server.setRequestHandler(ListToolsRequestSchema, this.handleTools.bind(this));
  }

  /**
   * Sets up tool handlers registry
   * 
   * @private
   */
  private setupToolHandlers(): void {
    this.toolHandlers.set('add_reaction', this.handleAddReaction.bind(this));
    this.toolHandlers.set('edit_message', this.handleEditMessage.bind(this));
    this.toolHandlers.set('get_channel_history', this.handleGetChannelHistory.bind(this));
    this.toolHandlers.set('get_thread_replies', this.handleGetThreadReplies.bind(this));
    this.toolHandlers.set('get_user_profile', this.handleGetUserProfile.bind(this));
    this.toolHandlers.set('get_users', this.handleGetUsers.bind(this));
    this.toolHandlers.set('list_channels', this.handleListChannels.bind(this));
    this.toolHandlers.set('post_message', this.handlePostMessage.bind(this));
    this.toolHandlers.set('reply_to_thread', this.handleReplyToThread.bind(this));
  }

  /**
   * Connects the MCP server to the specified transport with proper error handling
   * 
   * @param {StdioServerTransport} transport - Transport for MCP communication
   * @returns {Promise<void>} Promise that resolves when connection is established
   */
  async connect(transport: StdioServerTransport): Promise<void> {
    this.transport = transport;
    transport.onerror = () => { };
    await this.server.connect(transport);
  }
}
