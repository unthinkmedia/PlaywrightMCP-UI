/**
 * Playwright Timeline MCP App
 * 
 * Main React application that displays Playwright execution results
 * in a visual timeline format. Uses the MCP Apps SDK to communicate
 * with the host (VS Code, Claude, etc.) and the server.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps/react";

// Safe area insets for mobile/notch handling
interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Types matching server's output schema
interface StepResult {
  index: number;
  type: string;
  selector?: string;
  value?: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  screenshot?: string;
  error?: string;
  url?: string;
}

interface ExecutionSummary {
  total: number;
  passed: number;
  failed: number;
  totalDuration: number;
}

interface TimelineData {
  steps: StepResult[];
  summary: ExecutionSummary;
}

// ============================================================
// Step Card Component
// ============================================================
interface StepCardProps {
  step: StepResult;
  isExpanded: boolean;
  isReplaying: boolean;
  onToggle: () => void;
  onReplay: () => void;
  onScreenshotClick: () => void;
}

function StepCard({
  step,
  isExpanded,
  isReplaying,
  onToggle,
  onReplay,
  onScreenshotClick,
}: StepCardProps) {
  const statusIcon = {
    passed: "✓",
    failed: "✕",
    skipped: "○",
  }[step.status];

  const statusClass = `step-card step-${step.status}${isExpanded ? " expanded" : ""}`;

  return (
    <div className={statusClass}>
      <div className="step-header" onClick={onToggle}>
        <span className="expand-icon">›</span>
        <span className={`step-icon ${step.status}`}>{statusIcon}</span>
        <span className="step-index">{step.index}</span>
        <span className="step-type">{step.type}</span>
        {step.selector && (
          <code className="step-selector">{step.selector}</code>
        )}
        {step.value && step.type === "navigate" && (
          <code className="step-selector">{step.value}</code>
        )}
        <span className="step-duration">{step.duration}ms</span>
      </div>

      {isExpanded && (
        <div className="step-details">
          {step.value && step.type !== "navigate" && (
            <div className="step-value">
              <span className="label">Value:</span>
              <code className="value">{step.value}</code>
            </div>
          )}
          {step.url && (
            <div className="step-url">
              <span className="label">URL:</span>
              <span className="value">{step.url}</span>
            </div>
          )}
          {step.error && (
            <div className="step-error">
              <span className="label">Error:</span>
              <span className="error-text">{step.error}</span>
            </div>
          )}
          {step.screenshot && (
            <div className="step-screenshot">
              <img
                src={`data:image/png;base64,${step.screenshot}`}
                alt={`Screenshot after ${step.type}`}
                onClick={onScreenshotClick}
              />
            </div>
          )}
          <div className="step-actions">
            <button
              className="vscode-button"
              onClick={onReplay}
              disabled={isReplaying || step.status === "skipped"}
            >
              {isReplaying ? "↻ Replaying..." : "▶ Replay Step"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Screenshot Modal Component
// ============================================================
interface ScreenshotModalProps {
  screenshot: string;
  onClose: () => void;
}

function ScreenshotModal({ screenshot, onClose }: ScreenshotModalProps) {
  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} title="Close (Esc)">
          ✕
        </button>
        <img
          src={`data:image/png;base64,${screenshot}`}
          alt="Full screenshot"
        />
      </div>
    </div>
  );
}

// ============================================================
// Summary Bar Component
// ============================================================
interface SummaryBarProps {
  summary: ExecutionSummary;
}

function SummaryBar({ summary }: SummaryBarProps) {
  const passRate =
    summary.total > 0
      ? Math.round((summary.passed / summary.total) * 100)
      : 0;

  return (
    <div className="summary-bar">
      <div className="summary-stats">
        <span className="stat passed"><span className="icon">✓</span> {summary.passed} passed</span>
        <span className="stat failed"><span className="icon">✕</span> {summary.failed} failed</span>
        <span className="stat total">{summary.total} total</span>
        <span className="stat duration">⏱ {summary.totalDuration}ms</span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${passRate}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Main Timeline App Component
// ============================================================
export function TimelineApp() {
  const [app, setApp] = useState<App | null>(null);
  const [data, setData] = useState<TimelineData | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [replayingStep, setReplayingStep] = useState<number | null>(null);
  const [modalScreenshot, setModalScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Visibility-based resource management: pause expensive operations when offscreen
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsVisible(entry.isIntersecting);
          // Could pause animations, polling, etc. here
          if (!entry.isIntersecting) {
            // App scrolled offscreen - pause expensive operations
            console.log("Timeline offscreen - pausing");
          } else {
            // App visible again - resume
            console.log("Timeline visible - resuming");
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Apply host context (theme, styles, safe area)
  const applyHostContext = useCallback((ctx: McpUiHostContext) => {
    if (ctx.theme) {
      applyDocumentTheme(ctx.theme);
    }
    if (ctx.styles?.variables) {
      applyHostStyleVariables(ctx.styles.variables);
    }
    if (ctx.styles?.css?.fonts) {
      applyHostFonts(ctx.styles.css.fonts);
    }
    // Handle safe area insets for mobile/notch devices
    if (ctx.safeAreaInsets) {
      const { top, right, bottom, left } = ctx.safeAreaInsets as SafeAreaInsets;
      document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }
    // Check if fullscreen is available
    if (ctx.availableDisplayModes) {
      setCanFullscreen(ctx.availableDisplayModes.includes("fullscreen"));
    }
    // Track current display mode
    if (ctx.displayMode) {
      setIsFullscreen(ctx.displayMode === "fullscreen");
    }
  }, []);

  // Initialize MCP App connection
  useEffect(() => {
    const mcpApp = new App({
      name: "Playwright Timeline",
      version: "1.0.0",
    });

    // Handle streaming partial tool input (shows progress during LLM generation)
    mcpApp.ontoolinputpartial = (params) => {
      // Partial JSON is "healed" - always valid but may be incomplete
      const partialActions = params.arguments?.actions as unknown[];
      if (partialActions?.length) {
        // Show placeholder steps as they stream in
        const placeholderSteps: StepResult[] = partialActions.map((action, i) => ({
          index: i,
          type: (action as { type?: string })?.type || "...",
          selector: (action as { selector?: string })?.selector,
          status: "skipped" as const,
          duration: 0,
        }));
        setData({
          steps: placeholderSteps,
          summary: { total: placeholderSteps.length, passed: 0, failed: 0, totalDuration: 0 },
        });
      }
    };

    // Handle complete tool input (before execution)
    mcpApp.ontoolinput = (_params) => {
      // Clear placeholder, show "executing" state
      setError(null);
    };

    // Handle initial tool result
    mcpApp.ontoolresult = (result: CallToolResult) => {
      if (result.isError) {
        setError(result.content?.[0]?.type === "text" 
          ? (result.content[0] as { text: string }).text 
          : "Unknown error");
        return;
      }

      const structured = result.structuredContent as TimelineData | undefined;
      if (structured?.steps) {
        setData(structured);
        // Auto-expand failed steps
        const failedSteps = new Set(
          structured.steps
            .filter((s) => s.status === "failed")
            .map((s) => s.index)
        );
        setExpandedSteps(failedSteps);
        
        // Send debug log to host
        mcpApp.sendLog({ 
          level: "info", 
          data: `Received ${structured.steps.length} steps` 
        }).catch(() => {});
      }
    };

    // Handle teardown (cleanup when host removes the app)
    mcpApp.onteardown = async () => {
      // Close browser session on teardown
      try {
        await mcpApp.callServerTool({ name: "close-browser", arguments: {} });
      } catch {
        // Ignore errors during teardown
      }
      return {};
    };

    // Handle host context changes
    mcpApp.onhostcontextchanged = applyHostContext;

    // Connect to host
    mcpApp.connect().then(() => {
      setApp(mcpApp);
      const ctx = mcpApp.getHostContext();
      if (ctx) {
        applyHostContext(ctx);
      }
    });

    return () => {
      // Cleanup handled by onteardown
    };
  }, [applyHostContext]);

  // Toggle step expansion
  const toggleStep = useCallback((index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Replay a step
  const replayStep = useCallback(
    async (stepIndex: number) => {
      if (!app) return;

      setReplayingStep(stepIndex);
      try {
        const result = await app.callServerTool({
          name: "replay-step",
          arguments: { stepIndex },
        });

        if (!result.isError && result.structuredContent) {
          const { step } = result.structuredContent as { step: StepResult };
          setData((prev) => {
            if (!prev) return prev;
            const newSteps = [...prev.steps];
            newSteps[stepIndex] = step;
            return {
              ...prev,
              steps: newSteps,
            };
          });
        }
      } catch (err) {
        console.error("Replay failed:", err);
      } finally {
        setReplayingStep(null);
      }
    },
    [app]
  );

  // Update model context with current state
  const updateModelContext = useCallback(async () => {
    if (!app || !data) return;

    const summary = `Timeline Status:
- Total Steps: ${data.summary.total}
- Passed: ${data.summary.passed}
- Failed: ${data.summary.failed}
- Duration: ${data.summary.totalDuration}ms

${data.steps.map((s) => `${s.index}. [${s.status.toUpperCase()}] ${s.type}${s.selector ? ` → ${s.selector}` : ""}${s.error ? ` (Error: ${s.error})` : ""}`).join("\n")}`;

    await app.updateModelContext({
      content: [{ type: "text", text: summary }],
    });
  }, [app, data]);

  // Handle closing the browser
  const closeBrowser = useCallback(async () => {
    if (!app) return;
    await app.callServerTool({
      name: "close-browser",
      arguments: {},
    });
  }, [app]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(async () => {
    if (!app) return;
    const newMode = isFullscreen ? "inline" : "fullscreen";
    try {
      const result = await app.requestDisplayMode({ mode: newMode });
      setIsFullscreen(result.mode === "fullscreen");
    } catch (err) {
      console.error("Failed to toggle fullscreen:", err);
    }
  }, [app, isFullscreen]);

  // Render loading state
  if (!data) {
    return (
      <div ref={containerRef} className="timeline-app loading">
        {isVisible && <div className="loading-spinner" />}
        <p>Waiting for Playwright execution...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`timeline-app ${isFullscreen ? "fullscreen" : ""}`}
    >
      <header className="timeline-header">
        <h1><span className="icon">🎭</span> Playwright Timeline</h1>
        <div className="header-actions">
          <button onClick={updateModelContext} className="vscode-button secondary" title="Update model context">
            Update Context
          </button>
          {canFullscreen && (
            <button onClick={toggleFullscreen} className="vscode-button secondary" title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {isFullscreen ? "⛶ Exit" : "⛶ Fullscreen"}
            </button>
          )}
          <button onClick={closeBrowser} className="vscode-button danger" title="Close browser session">
            ✕ Close
          </button>
        </div>
      </header>

      <SummaryBar summary={data.summary} />

      <div className="timeline-steps">
        {data.steps.map((step) => (
          <StepCard
            key={step.index}
            step={step}
            isExpanded={expandedSteps.has(step.index)}
            isReplaying={replayingStep === step.index}
            onToggle={() => toggleStep(step.index)}
            onReplay={() => replayStep(step.index)}
            onScreenshotClick={() =>
              step.screenshot && setModalScreenshot(step.screenshot)
            }
          />
        ))}
      </div>

      {modalScreenshot && (
        <ScreenshotModal
          screenshot={modalScreenshot}
          onClose={() => setModalScreenshot(null)}
        />
      )}
    </div>
  );
}
