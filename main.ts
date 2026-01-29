#!/usr/bin/env node
/**
 * Playwright MCP App Server - Entry Point
 * 
 * Starts the MCP server with stdio transport for integration with
 * VS Code, Claude Desktop, and other MCP-compatible hosts.
 * 
 * Usage:
 *   node dist/main.js          # stdio mode (for VS Code, Claude)
 *   node dist/main.js --http   # HTTP mode (for basic-host testing)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";
import http from "node:http";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const USE_HTTP = process.argv.includes("--http") || process.env.HTTP === "true";

async function main() {
  const server = createServer();

  if (USE_HTTP) {
    // HTTP mode for basic-host testing
    const transports = new Map<string, SSEServerTransport>();

    const httpServer = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || "/", `http://localhost:${PORT}`);

      if (url.pathname === "/mcp" && req.method === "GET") {
        // SSE endpoint for receiving messages
        const transport = new SSEServerTransport("/mcp", res);
        transports.set(transport.sessionId, transport);
        
        await server.connect(transport);
        
        transport.onclose = () => {
          transports.delete(transport.sessionId);
        };
      } else if (url.pathname === "/mcp" && req.method === "POST") {
        // POST endpoint for sending messages
        const sessionId = url.searchParams.get("sessionId");
        const transport = sessionId ? transports.get(sessionId) : undefined;
        
        if (transport) {
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
            try {
              await transport.handlePostMessage(req, res, body);
            } catch (err) {
              res.writeHead(500);
              res.end(String(err));
            }
          });
        } else {
          res.writeHead(400);
          res.end("Invalid session");
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    httpServer.listen(PORT, () => {
      console.log(`MCP server listening on http://localhost:${PORT}/mcp`);
      console.log("Open basic-host and enter this URL in the Server URL field");
    });

    process.on("SIGINT", () => {
      httpServer.close();
      process.exit(0);
    });
  } else {
    // Stdio mode for VS Code, Claude Desktop
    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.on("SIGINT", async () => {
      await server.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
