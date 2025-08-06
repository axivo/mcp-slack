#!/usr/bin/env node
/**
 * Slack MCP Server Entry Point
 * 
 * Main entry point for the Slack MCP server application. Handles environment
 * validation, server initialization, and transport setup.
 * 
 * @module index
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SlackMcpServer } from "./server/mcp.js";

/**
 * Sets up global error handlers to prevent crashes
 */
function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error.message);
    if (error.message.includes('EPIPE') || (error as any).code === 'EPIPE') {
      console.error('EPIPE error caught - continuing operation');
      return;
    }
    console.error('Fatal error:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    if (reason && typeof reason === 'object' && 
        ((reason as any).code === 'EPIPE' || (reason as Error).message?.includes('EPIPE'))) {
      console.error('EPIPE rejection caught - continuing operation');
      return;
    }
  });
}

/**
 * Main entry point for the Slack MCP Server
 * 
 * Validates environment variables, initializes the SlackMcpServer,
 * and establishes stdio transport for communication with Claude agents.
 * 
 * @async
 * @function main
 * @throws {Error} When required environment variables are missing or server initialization fails
 */
async function main(): Promise<void> {
  // Set up error handlers first
  setupGlobalErrorHandlers();
  
  const botToken = process.env.SLACK_BOT_TOKEN;
  const teamId = process.env.SLACK_TEAM_ID;
  if (!botToken || !teamId) {
    console.error(
      "Please set SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables",
    );
    process.exit(1);
  }

  console.error("Starting Slack MCP Server...");
  const slackServer = new SlackMcpServer(botToken);

  // Connect MCP transport first
  const transport = new StdioServerTransport();
  
  try {
    await slackServer.connect(transport);
    console.error("Slack MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to connect MCP transport:", error);
    // Don't exit on transport errors - try to continue
  }

  console.error("Slack MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
