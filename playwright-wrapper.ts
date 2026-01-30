/**
 * Playwright Wrapper with Instrumentation
 * 
 * Wraps Playwright browser automation with step-by-step tracking,
 * screenshot capture, video recording, and CDP screencast capabilities.
 */

import { chromium, Browser, Page, BrowserContext, CDPSession } from "playwright";

export interface PlaywrightAction {
  type: "click" | "fill" | "wait" | "screenshot" | "hover" | "select" | "navigate";
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface StepResult {
  index: number;
  type: string;
  selector?: string;
  value?: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  screenshot?: string; // base64
  error?: string;
  url?: string;
}

export interface RunOptions {
  captureScreenshots?: boolean;
  screenshotOnFailure?: boolean;
  /** Screenshot format: 'png' (default, lossless) or 'jpeg' (smaller size) */
  screenshotFormat?: 'png' | 'jpeg';
  /** JPEG quality 0-100 (default: 80) */
  screenshotQuality?: number;
}

export interface PlaywrightRunnerOptions {
  headless?: boolean;
  /** Enable video recording */
  recordVideo?: boolean;
  /** Directory to save video recordings */
  videoDir?: string;
  /** Video size (defaults to viewport) */
  videoSize?: { width: number; height: number };
}

export interface ScreencastOptions {
  /** Image format (default: 'png') */
  format?: 'jpeg' | 'png';
  /** Image quality 0-100 (default: 80) */
  quality?: number;
  /** Max width of screencast frames */
  maxWidth?: number;
  /** Max height of screencast frames */
  maxHeight?: number;
  /** Capture every Nth frame (default: 1) */
  everyNthFrame?: number;
}

export interface ScreencastFrame {
  /** Base64 encoded image data */
  data: string;
  /** Frame metadata */
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
}

export class PlaywrightRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpSession: CDPSession | null = null;
  private screencastActive: boolean = false;
  private options: PlaywrightRunnerOptions;

  constructor(options: PlaywrightRunnerOptions = {}) {
    this.options = {
      headless: true,
      recordVideo: false,
      videoDir: './videos',
      ...options,
    };
  }

  /**
   * Run a sequence of Playwright actions with instrumentation.
   */
  async run(
    url: string,
    actions: PlaywrightAction[],
    options: RunOptions = {}
  ): Promise<StepResult[]> {
    const { 
      captureScreenshots = true, 
      screenshotOnFailure = true,
      screenshotFormat = 'png',
      screenshotQuality = 80,
    } = options;
    const steps: StepResult[] = [];

    // Launch browser with timeout
    this.browser = await chromium.launch({
      headless: this.options.headless,
      timeout: 30000, // 30 second timeout for browser launch
    });
    
    // Build context options
    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: { width: 1280, height: 720 },
    };
    
    // Add video recording if enabled
    if (this.options.recordVideo) {
      contextOptions.recordVideo = {
        dir: this.options.videoDir || './videos',
        size: this.options.videoSize || { width: 1280, height: 720 },
      };
    }
    
    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();

    // Navigate to starting URL
    const navStep = await this.executeStep(
      {
        index: 1,
        type: "navigate",
        value: url,
      },
      async () => {
        await this.page!.goto(url, { waitUntil: "domcontentloaded" });
      },
      captureScreenshots,
      { format: screenshotFormat, quality: screenshotQuality }
    );
    steps.push(navStep);

    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const stepIndex = i + 2;

      // Skip remaining actions if previous failed (unless it's a screenshot)
      if (
        steps.some((s) => s.status === "failed") &&
        action.type !== "screenshot"
      ) {
        steps.push({
          index: stepIndex,
          type: action.type,
          selector: action.selector,
          value: action.type === "fill" ? this.maskValue(action.value, action.selector) : action.value,
          status: "skipped",
          duration: 0,
        });
        continue;
      }

      const step = await this.executeStep(
        {
          index: stepIndex,
          type: action.type,
          selector: action.selector,
          value: action.type === "fill" ? this.maskValue(action.value, action.selector) : action.value,
        },
        () => this.performAction(action),
        captureScreenshots || (screenshotOnFailure && action.type !== "screenshot"),
        { format: screenshotFormat, quality: screenshotQuality }
      );

      steps.push(step);
    }

    return steps;
  }

  /**
   * Replay a single step from a previous run.
   */
  async replayStep(
    step: StepResult,
    screenshotOptions: { format: 'png' | 'jpeg'; quality: number } = { format: 'png', quality: 80 }
  ): Promise<StepResult> {
    if (!this.page) {
      throw new Error("No active page");
    }

    const action: PlaywrightAction = {
      type: step.type as PlaywrightAction["type"],
      selector: step.selector,
      value: step.value,
    };

    return this.executeStep(
      {
        index: step.index,
        type: step.type,
        selector: step.selector,
        value: step.value,
      },
      () => this.performAction(action),
      true,
      screenshotOptions
    );
  }

  /**
   * Execute a step with timing and error handling.
   */
  private async executeStep(
    metadata: Omit<StepResult, "status" | "duration" | "screenshot" | "error">,
    action: () => Promise<void>,
    captureScreenshot: boolean,
    screenshotOptions: { format: 'png' | 'jpeg'; quality: number } = { format: 'png', quality: 80 }
  ): Promise<StepResult> {
    const start = Date.now();

    try {
      await action();
      const duration = Date.now() - start;

      let screenshot: string | undefined;
      if (captureScreenshot && this.page) {
        screenshot = await this.captureBase64Screenshot(screenshotOptions.format, screenshotOptions.quality);
      }

      return {
        ...metadata,
        status: "passed",
        duration,
        screenshot,
        url: this.page?.url(),
      };
    } catch (err) {
      const duration = Date.now() - start;
      const error = err instanceof Error ? err.message : String(err);

      let screenshot: string | undefined;
      if (this.page) {
        try {
          screenshot = await this.captureBase64Screenshot(screenshotOptions.format, screenshotOptions.quality);
        } catch {
          // Ignore screenshot errors during failure capture
        }
      }

      return {
        ...metadata,
        status: "failed",
        duration,
        error,
        screenshot,
        url: this.page?.url(),
      };
    }
  }

  /**
   * Perform a single Playwright action.
   */
  private async performAction(action: PlaywrightAction): Promise<void> {
    if (!this.page) {
      throw new Error("No active page");
    }

    const timeout = action.timeout ?? 5000;

    switch (action.type) {
      case "click":
        if (!action.selector) throw new Error("Selector required for click");
        await this.page.click(action.selector, { timeout });
        break;

      case "fill":
        if (!action.selector) throw new Error("Selector required for fill");
        if (action.value === undefined) throw new Error("Value required for fill");
        await this.page.fill(action.selector, action.value, { timeout });
        break;

      case "hover":
        if (!action.selector) throw new Error("Selector required for hover");
        await this.page.hover(action.selector, { timeout });
        break;

      case "select":
        if (!action.selector) throw new Error("Selector required for select");
        if (action.value === undefined) throw new Error("Value required for select");
        await this.page.selectOption(action.selector, action.value, { timeout });
        break;

      case "wait":
        if (action.selector) {
          await this.page.waitForSelector(action.selector, { timeout });
        } else if (action.value) {
          // Wait for specific time
          await this.page.waitForTimeout(parseInt(action.value, 10) || 1000);
        } else {
          await this.page.waitForTimeout(1000);
        }
        break;

      case "screenshot":
        // Screenshot is captured in executeStep
        break;

      case "navigate":
        if (!action.value) throw new Error("URL required for navigate");
        await this.page.goto(action.value, { waitUntil: "domcontentloaded", timeout });
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Capture a base64-encoded screenshot.
   */
  private async captureBase64Screenshot(
    format: 'png' | 'jpeg' = 'png',
    quality: number = 80
  ): Promise<string> {
    if (!this.page) {
      throw new Error("No active page");
    }
    const options: { type: 'png' | 'jpeg'; quality?: number } = { type: format };
    if (format === 'jpeg') {
      options.quality = quality;
    }
    const buffer = await this.page.screenshot(options);
    return buffer.toString("base64");
  }

  /**
   * Take a screenshot of the current page state.
   */
  async takeScreenshot(): Promise<string> {
    return this.captureBase64Screenshot();
  }

  /**
   * Mask sensitive values (like passwords).
   * Detects password fields by selector heuristics.
   */
  private maskValue(value?: string, selector?: string): string | undefined {
    if (!value) return value;
    
    // Check if selector indicates a password field
    const isPasswordField = selector && (
      selector.includes('[type="password"]') ||
      selector.includes('[type=password]') ||
      selector.toLowerCase().includes('password') ||
      selector.includes('#password') ||
      selector.includes('.password')
    );
    
    if (isPasswordField) {
      return '•'.repeat(Math.min(value.length, 12));
    }
    
    return value;
  }

  /**
   * Start CDP screencast for live browser streaming.
   * Frames are delivered via the onFrame callback.
   */
  async startScreencast(
    onFrame: (frame: ScreencastFrame) => void,
    options: ScreencastOptions = {}
  ): Promise<void> {
    if (!this.page) {
      throw new Error("No active page. Call run() first or create a page manually.");
    }
    
    if (this.screencastActive) {
      throw new Error("Screencast already active");
    }

    const {
      format = 'png',
      quality = 80,
      maxWidth = 1280,
      maxHeight = 720,
      everyNthFrame = 1,
    } = options;

    // Create CDP session
    this.cdpSession = await this.page.context().newCDPSession(this.page);
    
    // Listen for screencast frames
    this.cdpSession.on('Page.screencastFrame', async (event) => {
      // Guard against stale callbacks after screencast stopped
      if (!this.screencastActive) return;
      
      const frame: ScreencastFrame = {
        data: event.data,
        metadata: {
          ...event.metadata,
          timestamp: Date.now(),
        },
      };
      
      onFrame(frame);
      
      // Acknowledge the frame to receive the next one
      if (this.cdpSession && this.screencastActive) {
        try {
          await this.cdpSession.send('Page.screencastFrameAck', {
            sessionId: event.sessionId,
          });
        } catch {
          // Session may have been closed
        }
      }
    });

    // Start the screencast
    await this.cdpSession.send('Page.startScreencast', {
      format,
      quality,
      maxWidth,
      maxHeight,
      everyNthFrame,
    });
    
    this.screencastActive = true;
  }

  /**
   * Stop the CDP screencast.
   */
  async stopScreencast(): Promise<void> {
    if (!this.screencastActive || !this.cdpSession) {
      return;
    }

    try {
      await this.cdpSession.send('Page.stopScreencast');
    } catch {
      // Ignore errors during stop
    }
    
    this.screencastActive = false;
    
    // Detach CDP session
    try {
      await this.cdpSession.detach();
    } catch {
      // Ignore detach errors
    }
    this.cdpSession = null;
  }

  /**
   * Check if screencast is currently active.
   */
  isScreencastActive(): boolean {
    return this.screencastActive;
  }

  /**
   * Get the video file path after recording completes.
   * Must be called after the page is closed.
   */
  async getVideoPath(): Promise<string | null> {
    if (!this.page) {
      return null;
    }
    
    const video = this.page.video();
    if (!video) {
      return null;
    }
    
    try {
      return await video.path();
    } catch {
      return null;
    }
  }

  /**
   * Save the recorded video to a specific path.
   * Must be called before the browser context is closed.
   */
  async saveVideo(path: string): Promise<void> {
    if (!this.page) {
      throw new Error("No active page");
    }
    
    const video = this.page.video();
    if (!video) {
      throw new Error("No video recording. Enable recordVideo in options.");
    }
    
    await video.saveAs(path);
  }

  /**
   * Delete the recorded video file.
   */
  async deleteVideo(): Promise<void> {
    if (!this.page) {
      return;
    }
    
    const video = this.page.video();
    if (video) {
      try {
        await video.delete();
      } catch {
        // Ignore delete errors
      }
    }
  }

  /**
   * Close the browser and clean up resources.
   */
  async close(): Promise<void> {
    // Stop screencast if active
    if (this.screencastActive) {
      await this.stopScreencast();
    }
    
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
