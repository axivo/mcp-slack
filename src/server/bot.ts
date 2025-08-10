import { query } from '@anthropic-ai/claude-code';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SocketModeClient } from '@slack/socket-mode';
import { readFileSync } from 'fs';
import { SlackClient } from './client.js';

interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface SlackEvent {
  type: string;
  channel?: string;
  user?: string;
  text?: string;
  thread_ts?: string;
  envelope_id?: string;
}



/**
 * Universal MCP interface via Slack bot
 * 
 * @class SlackBot
 */
export class SlackBot {
  private mcpClients: Map<string, Client> = new Map();
  private slackClient: SlackClient;
  private socketClient: SocketModeClient;

  /**
   * Creates a new SlackBot instance
   * 
   * @param {string} botToken - Slack bot token for API authentication
   * @param {string} appToken - Slack app token for Socket Mode
   */
  constructor(botToken: string, appToken: string) {
    this.slackClient = new SlackClient(botToken);
    this.socketClient = new SocketModeClient({ appToken });
  }

  /**
   * Handles incoming Slack messages by forwarding to MCP servers
   * 
   * @param {SlackEvent} event - Slack event data
   * @returns {Promise<void>} Promise that resolves when message is processed
   */
  private async handleMessage(event: SlackEvent): Promise<void> {
    if (!event.text || !event.channel || !event.user) {
      return;
    }
    const cleanText = event.text.replace(/<@U\w+>/g, '').trim();
    if (!cleanText) {
      return;
    }
    try {
      const response = await this.processMessage(cleanText, event.channel, event.user);
      if (event.thread_ts) {
        await this.slackClient.postReply(event.channel, event.thread_ts, response);
      } else {
        await this.slackClient.postMessage(event.channel, response);
      }
    } catch (error) {
      const errorMessage = `Error processing message: ${error instanceof Error ? error.message : String(error)}`;
      if (event.thread_ts) {
        await this.slackClient.postReply(event.channel, event.thread_ts, errorMessage);
      } else {
        await this.slackClient.postMessage(event.channel, errorMessage);
      }
    }
  }

  /**
   * Initializes MCP client connections to all configured servers
   * 
   * @returns {Promise<void>} Promise that resolves when all clients are connected
   */
  private async initializeMCPClients(): Promise<void> {
    try {
      const config = this.loadMCPConfig();
      for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
        if (serverName === 'slack') continue;
        const client = new Client(
          { name: 'SlackBot', version: this.slackClient.version() },
          { capabilities: {} }
        );
        const transport = new StdioClientTransport({
          command: serverConfig.command,
          args: serverConfig.args,
          env: this.substituteEnvVars(serverConfig.env)
        });
        await client.connect(transport);
        this.mcpClients.set(serverName, client);
      }
    } catch (error) {
      console.error(`MCP configuration error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('SlackBot will operate in Slack-only mode');
    }
  }

  /**
   * Loads MCP configuration from environment variable
   * 
   * @returns {MCPConfig} Parsed MCP configuration
   * @throws {Error} When SLACK_BOT_FILE_PATH is not set or file cannot be read
   */
  private loadMCPConfig(): MCPConfig {
    const envPath = process.env.SLACK_BOT_FILE_PATH;
    if (!envPath) {
      throw new Error('Please set SLACK_BOT_FILE_PATH environment variable');
    }
    const content = readFileSync(envPath, 'utf8');
    return JSON.parse(content);
  }

  /**
   * Processes user message through Claude Code with MCP tool access
   * 
   * @param {string} message - Clean user message
   * @param {string} channel - Slack channel ID
   * @param {string} user - Slack user ID
   * @returns {Promise<string>} Response message
   */
  private async processMessage(message: string, channel: string, user: string): Promise<string> {
    try {
      for await (const response of query({ prompt: message })) {
        if (typeof response === 'string') return response;
        return JSON.stringify(response, null, 2);
      }
      return 'No response from Claude';
    } catch (error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Sets up Socket Mode event handlers
   * 
   * @returns {void}
   */
  private setupEventHandlers(): void {
    this.socketClient.on('app_mention', async ({ body, ack }) => {
      await ack();
      if (body.event) {
        await this.handleMessage(body.event);
      }
    });
  }

  /**
   * Substitutes environment variables in configuration values
   * 
   * @param {Record<string, string>} env - Environment variable mapping
   * @returns {Record<string, string>} Environment variables with substituted values
   */
  private substituteEnvVars(env: Record<string, string>): Record<string, string> {
    if (!env) return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      result[key] = value.replace(/\$\{(\w+)\}/g, (_, varName) =>
        process.env[varName] || value);
    }
    return result;
  }

  /**
   * Shuts down all connections and performs cleanup
   * 
   * @returns {Promise<void>} Promise that resolves when cleanup is complete
   */
  async cleanup(): Promise<void> {
    console.error('Shutting down SlackBot...');
    try {
      await this.socketClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting socket client:', error);
    }
    for (const [name, client] of this.mcpClients.entries()) {
      try {
        await client.close();
        console.error(`Disconnected from ${name}`);
      } catch (error) {
        console.error(`Error disconnecting ${name}:`, error);
      }
    }
    this.mcpClients.clear();
  }

  /**
   * Starts the SlackBot and initializes all connections
   * 
   * @returns {Promise<void>} Promise that resolves when bot is ready
   */
  async start(): Promise<void> {
    console.error('Initializing SlackBot...');
    await this.initializeMCPClients();
    this.setupEventHandlers();
    await this.socketClient.start();
    console.error(`SlackBot active with ${this.mcpClients.size} MCP servers connected`);
  }
}
