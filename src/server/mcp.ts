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
import { Client } from './client.js';
import { McpTool } from './tool.js';

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
 * Slack MCP Server implementation bridging Slack API with Model Context Protocol
 * 
 * Provides comprehensive interface for Slack workspace operations through MCP tools,
 * managing API communication, request routing, and response formatting.
 * 
 * @class McpServer
 */
export class McpServer {
  private client: Client;
  private server: Server;
  private tool: McpTool;
  private toolHandlers: Map<string, ToolHandler>;
  private users: number;

  /**
   * Creates a new McpServer instance with tool setup
   * 
   * Initializes client, MCP server, and tool registry.
   * Sets up handler mappings and prepares for transport connection.
   * 
   * @param {string} botToken - Slack bot token for API authentication
   */
  constructor(botToken: string) {
    this.client = new Client(botToken);
    this.users = 100;
    this.server = new Server(
      { name: 'slack', version: this.client.version() },
      { capabilities: { tools: {} } }
    );
    this.tool = new McpTool(this.users);
    this.toolHandlers = new Map<string, ToolHandler>();
    this.setupToolHandlers();
    this.setupHandlers();
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
    const text = slackifyMarkdown(args.text);
    const response = await this.client.editMessage(args.channel_id, args.timestamp, text);
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
    const text = slackifyMarkdown(args.text);
    const response = await this.client.postMessage(args.channel_id, text);
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
    const text = slackifyMarkdown(args.text);
    const response = await this.client.postReply(args.channel_id, args.thread_ts, text, args.broadcast);
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
   * Returns complete list of available MCP tools with their schemas
   * and descriptions for client capability discovery.
   * 
   * @private
   * @returns {Promise<{tools: Tool[]}>} Complete tool registry for MCP protocol
   */
  private async handleTools(): Promise<{ tools: Tool[] }> {
    return { tools: this.tool.getTools() };
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
   * Connects the MCP server to stdio transport with error handling
   * 
   * Establishes MCP communication channel using standard input/output streams,
   * configures error handling, and starts message processing.
   * 
   * @param {StdioServerTransport} transport - Stdio transport for MCP communication
   * @returns {Promise<void>} Promise that resolves when connection is established and listening
   */
  async connect(transport: StdioServerTransport): Promise<void> {
    transport.onerror = () => { };
    await this.server.connect(transport);
  }
}
