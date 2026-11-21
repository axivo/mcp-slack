#!/usr/bin/env node
/**
 * Slack MCP Server Entry Point
 *
 * Main entry point for the Slack MCP server application. Handles
 * environment validation, server initialization and stdio serving.
 *
 * @module index
 * @author AXIVO
 * @license BSD-3-Clause
 */

import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { Client } from './server/client.js';
import { Mcp } from './server/mcp.js';

/**
 * Main entry point for the Slack MCP Server
 *
 * Validates the environment, builds the client and serves the MCP server
 * over stdio for both the 2025-era and the 2026-07-28 protocol revisions.
 *
 * @function main
 * @throws {Error} When server initialization fails
 */
function main(): void {
  process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
    console.error('Uncaught exception:', error.message);
    if (error.message.includes('EPIPE') || error.code === 'EPIPE') {
      console.error('EPIPE error caught - continuing operation');
      return;
    }
    console.error('Fatal error:', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    if (reason instanceof Error && ((reason as NodeJS.ErrnoException).code === 'EPIPE' || reason.message.includes('EPIPE'))) {
      console.error('EPIPE rejection caught - continuing operation');
      return;
    }
  });
  const botToken = process.env.SLACK_BOT_TOKEN;
  const teamId = process.env.SLACK_TEAM_ID;
  if (!botToken || !teamId) {
    console.error('Please set SLACK_BOT_TOKEN and SLACK_TEAM_ID environment variables');
    process.exit(1);
  }
  const mcp = new Mcp(new Client(botToken, teamId, process.env.SLACK_CHANNEL_IDS, process.env.SLACK_FILES_DIR));
  serveStdio(() => mcp.createServer());
}

try {
  main();
} catch (error) {
  console.error('Fatal error in main():', error);
  process.exit(1);
}
