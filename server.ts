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
import os from "node:os";
import { exec } from "node:child_process";
import { PlaywrightRunner, type PlaywrightAction, type StepResult, type ScreencastFrame } from "./playwright-wrapper.js";

// When running from dist/, import.meta.dirname is already the dist folder
const DIST_DIR = import.meta.dirname;
const VIDEOS_DIR = path.join(DIST_DIR, '..', 'videos');

// Ensure videos directory exists
fs.mkdir(VIDEOS_DIR, { recursive: true }).catch(() => {});

// In-memory storage for the current session's steps (for replay)
let currentSteps: StepResult[] = [];
let runner: PlaywrightRunner | null = null;
let screencastFrameCallback: ((frame: ScreencastFrame) => void) | null = null;
let isRecordingVideo = false;
let isHeadless = true; // Track if browser is in headless mode

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
          .describe("Run browser in headless mode (default: true)"),
        captureScreenshots: z
          .boolean()
          .optional()
          .default(true)
          .describe("Capture screenshot after each action"),
        screenshotFormat: z
          .enum(["png", "jpeg"])
          .optional()
          .default("png")
          .describe("Screenshot format: 'png' (lossless) or 'jpeg' (smaller file size)"),
        screenshotQuality: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .default(80)
          .describe("JPEG quality 0-100 (only used when format is 'jpeg')"),
        recordVideo: z
          .boolean()
          .optional()
          .default(false)
          .describe("Record video of the entire session (default: false)"),
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
        videoPath: z.string().optional(),
      },
      _meta: {
        ui: { resourceUri },
      },
    },
    async ({ url, actions, headless, captureScreenshots, screenshotFormat, screenshotQuality, recordVideo }) => {
      // Close existing runner if any
      if (runner) {
        await runner.close();
      }
      
      // Track browser mode
      isHeadless = headless ?? true;
      isRecordingVideo = recordVideo ?? false;
      
      // Initialize runner with video recording option
      runner = new PlaywrightRunner({ 
        headless: isHeadless,
        recordVideo,
        videoDir: VIDEOS_DIR,
      });
      
      try {
        // Run all actions
        currentSteps = await runner.run(url, actions as PlaywrightAction[], {
          captureScreenshots,
          screenshotFormat: screenshotFormat as 'png' | 'jpeg',
          screenshotQuality,
        });

        // Calculate summary
        const summary = {
          total: currentSteps.length,
          passed: currentSteps.filter((s) => s.status === "passed").length,
          failed: currentSteps.filter((s) => s.status === "failed").length,
          totalDuration: currentSteps.reduce((sum, s) => sum + s.duration, 0),
        };

        // Note: Video is only finalized when browser closes
        // User should call save-video or close-browser to get the video file

        // Return structured content for the UI
        return {
          content: [
            {
              type: "text",
              text: `Executed ${summary.total} actions: ${summary.passed} passed, ${summary.failed} failed (${summary.totalDuration}ms total)${recordVideo ? " [Video recording active - call save-video or close browser to save]" : ""}`,
            },
          ],
          structuredContent: {
            steps: currentSteps,
            summary,
            videoRecording: recordVideo ?? false,
            isHeadless: isHeadless, // Tell UI if screencast is possible
          },
        };
      } finally {
        // Don't close browser yet - allow interactions
      }
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
  // TOOL: preview-screenshot (app-only)
  // Open screenshot in system image viewer
  // ============================================================
  registerAppTool(
    server,
    "preview-screenshot",
    {
      title: "Preview Screenshot",
      description: "Open a screenshot in the system image viewer",
      inputSchema: {
        base64: z.string().describe("Base64 encoded image data (PNG)"),
        stepIndex: z.number().optional().describe("Step index for filename"),
      },
      outputSchema: {
        opened: z.boolean(),
        path: z.string().optional(),
        error: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ base64, stepIndex }) => {
      try {
        // Create temp directory for screenshots
        const tempDir = path.join(os.tmpdir(), 'playwright-mcp-screenshots');
        await fs.mkdir(tempDir, { recursive: true });
        
        // Generate filename
        const timestamp = Date.now();
        const filename = stepIndex !== undefined 
          ? `step-${stepIndex}-${timestamp}.png`
          : `screenshot-${timestamp}.png`;
        const filePath = path.join(tempDir, filename);
        
        // Write the image file
        const buffer = Buffer.from(base64, 'base64');
        await fs.writeFile(filePath, buffer);
        
        // Open with system default image viewer (macOS: open, Windows: start, Linux: xdg-open)
        const platform = process.platform;
        const openCmd = platform === 'darwin' ? 'open' 
          : platform === 'win32' ? 'start ""' 
          : 'xdg-open';
        
        exec(`${openCmd} "${filePath}"`, (error) => {
          if (error) {
            console.error('Failed to open image:', error);
          }
        });
        
        return {
          content: [{ type: "text", text: `Screenshot opened: ${filePath}` }],
          structuredContent: { opened: true, path: filePath },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to preview screenshot: ${error}` }],
          structuredContent: { opened: false, error },
          isError: true,
        };
      }
    }
  );

  // ============================================================
  // TOOL: save-screenshot (app-only)
  // Save screenshot to a persistent location
  // ============================================================
  registerAppTool(
    server,
    "save-screenshot",
    {
      title: "Save Screenshot",
      description: "Save a screenshot to the screenshots directory",
      inputSchema: {
        base64: z.string().describe("Base64 encoded image data (PNG)"),
        stepIndex: z.number().optional().describe("Step index for filename"),
      },
      outputSchema: {
        saved: z.boolean(),
        path: z.string().optional(),
        error: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ base64, stepIndex }) => {
      try {
        // Save to a screenshots directory in the workspace (cwd)
        const screenshotsDir = path.join(process.cwd(), 'playwright-screenshots');
        await fs.mkdir(screenshotsDir, { recursive: true });
        
        // Generate filename
        const timestamp = Date.now();
        const filename = stepIndex !== undefined 
          ? `step-${stepIndex}-${timestamp}.png`
          : `screenshot-${timestamp}.png`;
        const filePath = path.join(screenshotsDir, filename);
        
        // Write the image file
        const buffer = Buffer.from(base64, 'base64');
        await fs.writeFile(filePath, buffer);
        
        console.log('[save-screenshot] Saved to:', filePath);
        
        return {
          content: [{ type: "text", text: `Screenshot saved: ${filePath}` }],
          structuredContent: { saved: true, path: filePath },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[save-screenshot] Error:', error);
        return {
          content: [{ type: "text", text: `Failed to save screenshot: ${error}` }],
          structuredContent: { saved: false, error },
          isError: true,
        };
      }
    }
  );

  // ============================================================
  // TOOL: attach-screenshot (app-only)
  // Attach screenshot as context for the model
  // ============================================================
  registerAppTool(
    server,
    "attach-screenshot",
    {
      title: "Attach Screenshot",
      description: "Attach a screenshot and step information as context for the conversation",
      inputSchema: {
        base64: z.string().describe("Base64 encoded image data (PNG)"),
        stepIndex: z.number().optional().describe("Step index"),
        stepType: z.string().optional().describe("Step type (click, fill, etc.)"),
        stepSelector: z.string().optional().describe("CSS selector used"),
        stepValue: z.string().optional().describe("Value for fill/select actions"),
        stepStatus: z.enum(["passed", "failed", "skipped"]).optional().describe("Step execution status"),
        stepDuration: z.number().optional().describe("Execution duration in ms"),
        stepUrl: z.string().optional().describe("Page URL at the time"),
        stepError: z.string().optional().describe("Error message if failed"),
      },
      outputSchema: {
        attached: z.boolean(),
        message: z.string(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ base64, stepIndex, stepType, stepSelector, stepValue, stepStatus, stepDuration, stepUrl, stepError }) => {
      // Generate markdown with step information
      const lines: string[] = [];
      lines.push(`# Playwright Step ${stepIndex !== undefined ? stepIndex : ''}`);
      lines.push('');
      
      if (stepType) {
        lines.push(`**Action:** ${stepType}`);
      }
      if (stepSelector) {
        lines.push(`**Selector:** \`${stepSelector}\``);
      }
      if (stepValue) {
        lines.push(`**Value:** ${stepValue}`);
      }
      if (stepStatus) {
        const statusEmoji = stepStatus === 'passed' ? '✅' : stepStatus === 'failed' ? '❌' : '⏭️';
        lines.push(`**Status:** ${statusEmoji} ${stepStatus}`);
      }
      if (stepDuration !== undefined) {
        lines.push(`**Duration:** ${stepDuration}ms`);
      }
      if (stepUrl) {
        lines.push(`**URL:** ${stepUrl}`);
      }
      if (stepError) {
        lines.push('');
        lines.push('## Error');
        lines.push('```');
        lines.push(stepError);
        lines.push('```');
      }
      
      const markdown = lines.join('\n');
      
      return {
        content: [
          { 
            type: "image", 
            data: base64, 
            mimeType: "image/png" 
          },
          {
            type: "text",
            text: markdown,
          },
        ],
        structuredContent: { 
          attached: true, 
          message: `Step ${stepIndex !== undefined ? stepIndex : ''} screenshot and info attached as context` 
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
      description: "Close the browser and end the session. If video recording was enabled, returns the video path.",
      inputSchema: {
        saveVideoAs: z.string().optional().describe("Optional path to save the video to"),
      },
      outputSchema: {
        closed: z.boolean(),
        videoPath: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ saveVideoAs }) => {
      let videoPath: string | null = null;
      
      console.log("[close-browser] isRecordingVideo:", isRecordingVideo, "runner:", !!runner);
      
      if (runner) {
        // Save video if recording was enabled
        if (isRecordingVideo) {
          // Ensure videos directory exists
          try {
            await fs.mkdir(VIDEOS_DIR, { recursive: true });
          } catch {
            // Directory may already exist
          }
          
          const savePath = saveVideoAs || path.join(VIDEOS_DIR, `recording-${Date.now()}.webm`);
          console.log("[close-browser] Attempting to save video to:", savePath);
          
          try {
            await runner.saveVideo(savePath);
            videoPath = savePath;
            console.log("[close-browser] Video saved successfully:", videoPath);
          } catch (err) {
            // Video might not be available
            console.error("[close-browser] Failed to save video:", err);
          }
        }
        
        await runner.close();
        runner = null;
        currentSteps = [];
        screencastFrameCallback = null;
        isRecordingVideo = false;
        isHeadless = true;
      }
      
      return {
        content: [{ 
          type: "text", 
          text: videoPath ? `Browser closed. Video saved to: ${videoPath}` : "Browser closed" 
        }],
        structuredContent: {
          closed: true,
          videoPath: videoPath || undefined,
        },
      };
    }
  );

  // ============================================================
  // TOOL: save-video (app-only)
  // Save the recorded video to a file
  // ============================================================
  registerAppTool(
    server,
    "save-video",
    {
      title: "Save Video",
      description: "Save the recorded video to a file. Call this before closing the browser if you want to keep the video.",
      inputSchema: {
        path: z.string().describe("Path to save the video file (e.g., './videos/my-recording.webm')"),
      },
      outputSchema: {
        saved: z.boolean(),
        path: z.string().optional(),
        error: z.string().optional(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ path }) => {
      if (!runner) {
        return {
          content: [{ type: "text", text: "No active browser session" }],
          structuredContent: { saved: false, error: "No active browser session" },
          isError: true,
        };
      }

      try {
        await runner.saveVideo(path);
        return {
          content: [{ type: "text", text: `Video saved to: ${path}` }],
          structuredContent: { saved: true, path },
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to save video: ${error}` }],
          structuredContent: { saved: false, error },
          isError: true,
        };
      }
    }
  );

  // ============================================================
  // TOOL: start-screencast (app-only)
  // Start CDP screencast for live browser preview
  // ============================================================
  registerAppTool(
    server,
    "start-screencast",
    {
      title: "Start Screencast",
      description: "Start live browser preview using CDP screencast",
      inputSchema: {
        format: z.enum(["png", "jpeg"]).optional().default("jpeg").describe("Image format"),
        quality: z.number().min(0).max(100).optional().default(60).describe("Image quality"),
        maxWidth: z.number().optional().default(800).describe("Max frame width"),
        maxHeight: z.number().optional().default(600).describe("Max frame height"),
        everyNthFrame: z.number().optional().default(2).describe("Capture every Nth frame"),
      },
      outputSchema: {
        started: z.boolean(),
        message: z.string(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async ({ format, quality, maxWidth, maxHeight, everyNthFrame }, extra) => {
      if (!runner) {
        return {
          content: [{ type: "text", text: "No active browser session" }],
          structuredContent: { started: false, message: "No active browser session" },
          isError: true,
        };
      }

      // CDP screencast doesn't work properly in headless mode
      if (isHeadless) {
        return {
          content: [{ type: "text", text: "Screencast requires headless: false. Re-run with headless disabled." }],
          structuredContent: { started: false, message: "Screencast requires non-headless mode" },
          isError: true,
        };
      }

      if (runner.isScreencastActive()) {
        return {
          content: [{ type: "text", text: "Screencast already active" }],
          structuredContent: { started: false, message: "Screencast already active" },
        };
      }

      try {
        await runner.startScreencast(
          (frame) => {
            // Store frame for polling via get-screencast-frame
            if (screencastFrameCallback) {
              screencastFrameCallback(frame);
            }
          },
          { format, quality, maxWidth, maxHeight, everyNthFrame }
        );

        return {
          content: [{ type: "text", text: "Screencast started" }],
          structuredContent: { started: true, message: "Screencast started" },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Failed to start screencast: ${message}` }],
          structuredContent: { started: false, message },
          isError: true,
        };
      }
    }
  );

  // ============================================================
  // TOOL: stop-screencast (app-only)
  // Stop the CDP screencast
  // ============================================================
  registerAppTool(
    server,
    "stop-screencast",
    {
      title: "Stop Screencast",
      description: "Stop live browser preview",
      inputSchema: {},
      outputSchema: {
        stopped: z.boolean(),
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
          structuredContent: { stopped: false },
        };
      }

      await runner.stopScreencast();
      screencastFrameCallback = null;

      return {
        content: [{ type: "text", text: "Screencast stopped" }],
        structuredContent: { stopped: true },
      };
    }
  );

  // ============================================================
  // TOOL: get-screencast-frame (app-only)
  // Get the latest screencast frame (polling-based)
  // ============================================================
  let latestFrame: ScreencastFrame | null = null;

  // Set up frame callback
  screencastFrameCallback = (frame) => {
    latestFrame = frame;
  };

  registerAppTool(
    server,
    "get-screencast-frame",
    {
      title: "Get Screencast Frame",
      description: "Get the latest screencast frame",
      inputSchema: {},
      outputSchema: {
        hasFrame: z.boolean(),
        frame: z.object({
          data: z.string(),
          timestamp: z.number(),
          width: z.number(),
          height: z.number(),
        }).optional(),
      },
      _meta: {
        ui: {
          resourceUri,
          visibility: ["app"],
        },
      },
    },
    async () => {
      if (!latestFrame) {
        return {
          content: [{ type: "text", text: "No frame available" }],
          structuredContent: { hasFrame: false },
        };
      }

      const frame = latestFrame;
      latestFrame = null; // Clear after reading

      return {
        content: [{ type: "text", text: "Frame retrieved" }],
        structuredContent: {
          hasFrame: true,
          frame: {
            data: frame.data,
            timestamp: frame.metadata.timestamp || Date.now(),
            width: frame.metadata.deviceWidth,
            height: frame.metadata.deviceHeight,
          },
        },
      };
    }
  );

  // ============================================================
  // TOOL: run-with-preview (visible to model)
  // Run Playwright actions with live screencast preview
  // ============================================================
  registerAppTool(
    server,
    "run-with-preview",
    {
      title: "Run with Live Preview",
      description:
        "Execute browser automation with live preview. Shows real-time browser activity during execution.",
      inputSchema: {
        url: z.string().url().describe("Starting URL to navigate to"),
        actions: z
          .array(
            z.object({
              type: z
                .enum(["click", "fill", "wait", "screenshot", "hover", "select", "navigate"])
                .describe("Type of action to perform"),
              selector: z.string().optional().describe("CSS selector"),
              value: z.string().optional().describe("Value for fill/select"),
              timeout: z.number().optional().default(5000).describe("Timeout in ms"),
            })
          )
          .describe("List of actions to execute"),
        headless: z.boolean().optional().default(false).describe("Run headless (default: false for preview)"),
      },
      outputSchema: {
        steps: z.array(z.any()),
        summary: z.object({
          total: z.number(),
          passed: z.number(),
          failed: z.number(),
          totalDuration: z.number(),
        }),
        previewEnabled: z.boolean(),
      },
      _meta: {
        ui: { resourceUri },
      },
    },
    async ({ url, actions, headless }) => {
      // Close existing runner
      if (runner) {
        await runner.close();
      }

      // Initialize runner (headless false by default for preview)
      runner = new PlaywrightRunner({ headless: headless ?? false });

      try {
        // Navigate first to establish page
        currentSteps = await runner.run(url, [], { captureScreenshots: true });

        // Start screencast
        latestFrame = null;
        await runner.startScreencast(
          (frame) => {
            latestFrame = frame;
          },
          { format: "jpeg", quality: 60, maxWidth: 800, maxHeight: 600, everyNthFrame: 2 }
        );

        // Execute actions one by one
        for (const action of actions as PlaywrightAction[]) {
          const step = await runner.replayStep({
            index: currentSteps.length,
            type: action.type,
            selector: action.selector,
            value: action.value,
            status: "passed",
            duration: 0,
          });
          currentSteps.push(step);
        }

        // Stop screencast
        await runner.stopScreencast();

        const summary = {
          total: currentSteps.length,
          passed: currentSteps.filter((s) => s.status === "passed").length,
          failed: currentSteps.filter((s) => s.status === "failed").length,
          totalDuration: currentSteps.reduce((sum, s) => sum + s.duration, 0),
        };

        return {
          content: [
            {
              type: "text",
              text: `Executed ${summary.total} actions with live preview: ${summary.passed} passed, ${summary.failed} failed`,
            },
          ],
          structuredContent: {
            steps: currentSteps,
            summary,
            previewEnabled: true,
          },
        };
      } catch (err) {
        await runner?.stopScreencast();
        throw err;
      }
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
