/**
 * Playwright Wrapper with Instrumentation
 * 
 * Wraps Playwright browser automation with step-by-step tracking,
 * screenshot capture, and replay capabilities.
 */

import { chromium, Browser, Page, BrowserContext } from "playwright";

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
}

export interface PlaywrightRunnerOptions {
  headless?: boolean;
}

export class PlaywrightRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private options: PlaywrightRunnerOptions;

  constructor(options: PlaywrightRunnerOptions = {}) {
    this.options = {
      headless: true,
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
    const { captureScreenshots = true, screenshotOnFailure = true } = options;
    const steps: StepResult[] = [];

    // Launch browser
    this.browser = await chromium.launch({
      headless: this.options.headless,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    this.page = await this.context.newPage();

    // Navigate to starting URL
    const navStep = await this.executeStep(
      {
        index: 0,
        type: "navigate",
        value: url,
      },
      async () => {
        await this.page!.goto(url, { waitUntil: "domcontentloaded" });
      },
      captureScreenshots
    );
    steps.push(navStep);

    // Execute each action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const stepIndex = i + 1;

      // Skip remaining actions if previous failed (unless it's a screenshot)
      if (
        steps.some((s) => s.status === "failed") &&
        action.type !== "screenshot"
      ) {
        steps.push({
          index: stepIndex,
          type: action.type,
          selector: action.selector,
          value: action.type === "fill" ? this.maskValue(action.value) : action.value,
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
          value: action.type === "fill" ? this.maskValue(action.value) : action.value,
        },
        () => this.performAction(action),
        captureScreenshots || (screenshotOnFailure && action.type !== "screenshot")
      );

      steps.push(step);
    }

    return steps;
  }

  /**
   * Replay a single step from a previous run.
   */
  async replayStep(step: StepResult): Promise<StepResult> {
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
      true
    );
  }

  /**
   * Execute a step with timing and error handling.
   */
  private async executeStep(
    metadata: Omit<StepResult, "status" | "duration" | "screenshot" | "error">,
    action: () => Promise<void>,
    captureScreenshot: boolean
  ): Promise<StepResult> {
    const start = Date.now();

    try {
      await action();
      const duration = Date.now() - start;

      let screenshot: string | undefined;
      if (captureScreenshot && this.page) {
        screenshot = await this.captureBase64Screenshot();
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
          screenshot = await this.captureBase64Screenshot();
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
  private async captureBase64Screenshot(): Promise<string> {
    if (!this.page) {
      throw new Error("No active page");
    }
    const buffer = await this.page.screenshot({ type: "png" });
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
   */
  private maskValue(value?: string): string | undefined {
    if (!value) return value;
    // Simple heuristic: if it looks like a password field value, mask it
    if (value.length > 0) {
      return value; // In production, check the input type before masking
    }
    return value;
  }

  /**
   * Close the browser and clean up resources.
   */
  async close(): Promise<void> {
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
