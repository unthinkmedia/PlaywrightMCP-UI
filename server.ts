/**
 * Playwright MCP App Server
 * 
 * Registers tools and UI resources for the Playwright timeline app.
 * Following the MCP Apps pattern: Tool + UI Resource linked via resourceUri.
 */

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { PlaywrightRunner, type PlaywrightAction, type StepResult } from "./playwright-wrapper.js";

// When running from dist/, import.meta.dirname is already the dist folder
const DIST_DIR = import.meta.dirname;

// In-memory storage for the current session's steps (for replay)
let currentSteps: StepResult[] = [];
let runner: PlaywrightRunner | null = null;

/**
 * Creates and configures the MCP server with Playwright tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Playwright MCP App Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://playwright/timeline.html";

  // ============================================================
  // TOOL: playwright-run (visible to model)
  // Main tool that runs Playwright actions and returns a timeline
  // ============================================================
  registerAppTool(
    server,
    "playwright-run",
    {
      title: "Run Playwright Actions",
      description:
        "Execute a sequence of browser automation actions (navigate, click, fill, wait, screenshot) and display results in a visual timeline. Returns step-by-step execution details with screenshots. IMPORTANT: Include ALL actions in a single call to display them in one unified timeline - do not make multiple separate calls for multi-page workflows.",
      inputSchema: {
        url: z.string().url().describe("Starting URL to navigate to"),
        actions: z
          .array(
            z.object({
              type: z
                .enum(["click", "fill", "wait", "screenshot", "hover", "select", "navigate"])
                .describe("Type of action to perform (use 'navigate' to go to a new URL)"),
              selector: z
                .string()
                .optional()
                .describe("CSS selector or Playwright locator"),
              value: z
                .string()
                .optional()
                .describe("Value for fill/select actions"),
              timeout: z
                .number()
                .optional()
                .default(5000)
                .describe("Timeout in milliseconds"),
            })
          )
          .describe("List of actions to execute sequentially"),
        headless: z
          .boolean()
          .optional()
          .default(true)
          .describe("Run browser in headless mode"),
        captureScreenshots: z
          .boolean()
          .optional()
          .default(true)
          .describe("Capture screenshot after each action"),
      },
      outputSchema: {
        steps: z.array(
          z.object({
            index: z.number(),
            type: z.string(),
            selector: z.string().optional(),
            value: z.string().optional(),
            status: z.enum(["passed", "failed", "skipped"]),
            duration: z.number(),
            screenshot: z.string().optional(),
            error: z.string().optional(),
          })
        ),
        summary: z.object({
          total: z.number(),
          passed: z.number(),
          failed: z.number(),
          totalDuration: z.number(),
        }),
      },
      _meta: {
        ui: { resourceUri },
      },
    },
    async ({ url, actions, headless, captureScreenshots }) => {
      // Initialize runner
      runner = new PlaywrightRunner({ headless });
      
      try {
        // Run all actions
        currentSteps = await runner.run(url, actions as PlaywrightAction[], {
          captureScreenshots,
        });

        // Calculate summary
        const summary = {
          total: currentSteps.length,
          passed: currentSteps.filter((s) => s.status === "passed").length,
          failed: currentSteps.filter((s) => s.status === "failed").length,
          totalDuration: currentSteps.reduce((sum, s) => sum + s.duration, 0),
        };

        // Return structured content for the UI
        return {
          content: [
            {
              type: "text",
              text: `Executed ${summary.total} actions: ${summary.passed} passed, ${summary.failed} failed (${summary.totalDuration}ms total)`,
            },
          ],
          structuredContent: {
            steps: currentSteps,
            summary,
          },
        };
      } finally {
        // Don't close browser yet - allow replay
      }
    }
  );

  // ============================================================
  // TOOL: replay-step (app-only, hidden from model)
  // Allows the timeline UI to replay a specific step
  // ============================================================
  registerAppTool(
    server,
    "replay-step",
    {
      title: "Replay Step",
      description: "Re-execute a specific step from the timeline",
      inputSchema: {
        stepIndex: z.number().min(0).describe("Index of the step to replay"),
      },
      outputSchema: {
        step: z.object({
          index: z.number(),
          type: z.string(),
          status: z.enum(["passed", "failed", "skipped"]),
          duration: z.number(),
          screenshot: z.string().optional(),
          error: z.string().optional(),
        }),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"], // Hidden from model, only callable by the App
        },
      },
    },
    async ({ stepIndex }) => {
      if (!runner) {
        return {
          content: [{ type: "text", text: "No active session" }],
          isError: true,
        };
      }

      if (stepIndex < 0 || stepIndex >= currentSteps.length) {
        return {
          content: [{ type: "text", text: "Invalid step index" }],
          isError: true,
        };
      }

      const originalStep = currentSteps[stepIndex];
      const result = await runner.replayStep(originalStep);
      
      // Update stored step
      currentSteps[stepIndex] = result;

      return {
        content: [{ type: "text", text: `Replayed step ${stepIndex}` }],
        structuredContent: { step: result },
      };
    }
  );

  // ============================================================
  // TOOL: take-screenshot (app-only)
  // Capture current browser state
  // ============================================================
  registerAppTool(
    server,
    "take-screenshot",
    {
      title: "Take Screenshot",
      description: "Capture the current browser viewport",
      inputSchema: {},
      outputSchema: {
        screenshot: z.string().describe("Base64 encoded PNG"),
        timestamp: z.number(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async () => {
      if (!runner) {
        return {
          content: [{ type: "text", text: "No active session" }],
          isError: true,
        };
      }

      const screenshot = await runner.takeScreenshot();
      return {
        content: [{ type: "text", text: "Screenshot captured" }],
        structuredContent: {
          screenshot,
          timestamp: Date.now(),
        },
      };
    }
  );

  // ============================================================
  // TOOL: close-browser (app-only)
  // Close the browser session
  // ============================================================
  registerAppTool(
    server,
    "close-browser",
    {
      title: "Close Browser",
      description: "Close the browser and end the session",
      inputSchema: {},
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async () => {
      if (runner) {
        await runner.close();
        runner = null;
        currentSteps = [];
      }
      return {
        content: [{ type: "text", text: "Browser closed" }],
      };
    }
  );

  // ============================================================
  // RESOURCE: Timeline UI HTML
  // ============================================================
  registerAppResource(
    server,
    "Playwright Timeline",
    resourceUri,
    { description: "Visual timeline UI for Playwright execution results" },
    async () => {
      const htmlPath = path.join(DIST_DIR, "timeline.html");
      const html = await fs.readFile(htmlPath, "utf-8");
      return {
        contents: [
          {
            uri: resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
          },
        ],
      };
    }
  );

  return server;
}
