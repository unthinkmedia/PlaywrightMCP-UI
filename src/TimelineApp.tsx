/**
 * Playwright Timeline MCP App
 * 
 * Main React application that displays Playwright execution results
 * in a visual timeline format with live browser preview support.
 * Uses the MCP Apps SDK to communicate with the host.
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
  isActive: boolean;
  showScreenshot: boolean;
  onSelect: () => void;
  onPreviewScreenshot: (base64: string, stepIndex: number) => void;
  onSaveScreenshot: (base64: string, stepIndex: number) => void;
  onAttachScreenshot: (step: StepResult) => void;
  stepRef: (el: HTMLDivElement | null) => void;
}

function StepCard({
  step,
  isExpanded,
  isActive,
  showScreenshot,
  onSelect,
  onPreviewScreenshot,
  onSaveScreenshot,
  onAttachScreenshot,
  stepRef,
}: StepCardProps) {
  const statusIconClass = {
    passed: "codicon-pass",
    failed: "codicon-error",
    skipped: "codicon-circle-outline",
  }[step.status];

  const statusClass = `step-card step-${step.status}${isExpanded ? " expanded" : ""}${isActive ? " active-step" : ""}`;

  return (
    <div className={statusClass} ref={stepRef} onClick={onSelect}>
      <div className="step-header">
        <span className="expand-icon codicon codicon-chevron-right" />
        <span className={`step-icon codicon ${statusIconClass} ${step.status}`} />
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
          {showScreenshot && step.screenshot && (
            <div className="step-screenshot">
              <img
                src={`data:image/png;base64,${step.screenshot}`}
                alt={`Screenshot after ${step.type}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewScreenshot(step.screenshot!, step.index);
                }}
                style={{ cursor: 'pointer' }}
                title="Click to preview"
              />
            </div>
          )}
          {step.screenshot && (
            <div className="step-actions">
              <button
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPreviewScreenshot(step.screenshot!, step.index);
                }}
                title="Preview in image viewer"
              >
                <span className="codicon codicon-eye" />
              </button>
              <button
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveScreenshot(step.screenshot!, step.index);
                }}
                title="Save screenshot to file"
              >
                <span className="codicon codicon-save" />
              </button>
              <button
                className="icon-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAttachScreenshot(step);
                }}
                title="Attach as context"
              >
                <span className="codicon codicon-pin" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Screenshot Carousel Component
// ============================================================
interface ScreenshotCarouselProps {
  steps: StepResult[];
  activeIndex: number;
  isPlaying: boolean;
  onStepSelect: (index: number) => void;
  onTogglePlay: () => void;
}

function ScreenshotCarousel({ steps, activeIndex, isPlaying, onStepSelect, onTogglePlay }: ScreenshotCarouselProps) {
  const stepsWithScreenshots = steps.filter(s => s.screenshot);
  const currentStep = steps[activeIndex];
  
  // Find the index in stepsWithScreenshots array
  const currentScreenshotIndex = stepsWithScreenshots.findIndex(s => s.index === activeIndex);
  
  const goToPrev = useCallback(() => {
    // Find previous step with screenshot
    for (let i = activeIndex - 1; i >= 0; i--) {
      if (steps[i]?.screenshot) {
        onStepSelect(i);
        return;
      }
    }
  }, [activeIndex, steps, onStepSelect]);

  const goToNext = useCallback(() => {
    // Find next step with screenshot
    for (let i = activeIndex + 1; i < steps.length; i++) {
      if (steps[i]?.screenshot) {
        onStepSelect(i);
        return;
      }
    }
  }, [activeIndex, steps, onStepSelect]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        goToNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        onTogglePlay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, onTogglePlay]);

  const hasPrev = stepsWithScreenshots.some(s => s.index < activeIndex);
  const hasNext = stepsWithScreenshots.some(s => s.index > activeIndex);
  const isAtEnd = !hasNext && !isPlaying;

  return (
    <div className="screenshot-carousel">
      <div className="carousel-header">
        <span className="carousel-title">
          <span className="codicon codicon-file-media carousel-icon" />
          Step Screenshots
          <span className="carousel-counter">
            {currentScreenshotIndex >= 0 ? currentScreenshotIndex + 1 : 0} / {stepsWithScreenshots.length}
          </span>
        </span>
        <div className="carousel-controls">
          <button 
            className={`vscode-button ${isPlaying ? 'active' : 'secondary'}`} 
            onClick={onTogglePlay} 
            title={isPlaying ? 'Pause (Space)' : isAtEnd ? 'Replay slideshow (Space)' : 'Play slideshow (Space)'}
          >
            <span className={`codicon ${isPlaying ? 'codicon-debug-pause' : isAtEnd ? 'codicon-debug-restart' : 'codicon-play'}`} />
            {isPlaying ? ' Pause' : isAtEnd ? ' Replay' : ' Play'}
          </button>
        </div>
      </div>
      
      {/* Thumbnail strip */}
      <div className="carousel-thumbnails">
        {steps.map((step, idx) => (
          <button
            key={step.index}
            className={`thumbnail ${idx === activeIndex ? 'active' : ''} ${!step.screenshot ? 'no-image' : ''}`}
            onClick={() => onStepSelect(idx)}
            title={`Step ${step.index}: ${step.type}`}
          >
            {step.screenshot ? (
              <img src={`data:image/png;base64,${step.screenshot}`} alt="" />
            ) : (
              <span className="thumbnail-placeholder">{step.index}</span>
            )}
            <span className={`thumbnail-status ${step.status}`} />
          </button>
        ))}
      </div>

      <div className="carousel-content">
        <button 
          className="carousel-nav prev" 
          onClick={goToPrev} 
          disabled={!hasPrev}
          title="Previous (←)"
        >
          <span className="codicon codicon-chevron-left" />
        </button>
        
        <div className="carousel-image-container">
          {currentStep?.screenshot ? (
            <img
              src={`data:image/png;base64,${currentStep.screenshot}`}
              alt={`Step ${activeIndex}: ${currentStep.type}`}
              className="carousel-image"
            />
          ) : (
            <div className="carousel-no-screenshot">
              <span className="codicon codicon-device-camera no-screenshot-icon" />
              <p>No screenshot for this step</p>
            </div>
          )}
        </div>
        
        <button 
          className="carousel-nav next" 
          onClick={goToNext} 
          disabled={!hasNext}
          title="Next (→)"
        >
          <span className="codicon codicon-chevron-right" />
        </button>
      </div>

      {/* Step info label */}
      {currentStep && (
        <div className="carousel-step-info">
          <span className={`step-badge codicon ${currentStep.status === 'passed' ? 'codicon-pass' : currentStep.status === 'failed' ? 'codicon-error' : 'codicon-circle-outline'} ${currentStep.status}`} />
          <span className="step-label">
            Step {currentStep.index}: {currentStep.type}
            {currentStep.selector && <code>{currentStep.selector}</code>}
          </span>
        </div>
      )}
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
        <span className="stat passed"><span className="codicon codicon-pass icon" /> {summary.passed} passed</span>
        <span className="stat failed"><span className="codicon codicon-error icon" /> {summary.failed} failed</span>
        <span className="stat total">{summary.total} total</span>
        <span className="stat duration"><span className="codicon codicon-watch icon" /> {summary.totalDuration}ms</span>
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
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [showCarousel, setShowCarousel] = useState(true); // Show carousel by default
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      name: "Timeline",
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
        
        // Show carousel by default when we have steps
        setShowCarousel(true);
        setActiveStepIndex(0);
        
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

  // Preview screenshot (opens in system image viewer)
  const previewScreenshot = useCallback(
    async (base64: string, stepIndex: number) => {
      if (!app) return;
      
      try {
        await app.callServerTool({
          name: "preview-screenshot",
          arguments: { base64, stepIndex },
        });
      } catch (err) {
        console.error("Failed to preview screenshot:", err);
      }
    },
    [app]
  );

  // Save screenshot to file
  const saveScreenshot = useCallback(
    async (base64: string, stepIndex: number) => {
      if (!app) return;
      
      try {
        await app.callServerTool({
          name: "save-screenshot",
          arguments: { base64, stepIndex },
        });
      } catch (err) {
        console.error("Failed to save screenshot:", err);
      }
    },
    [app]
  );

  // Attach screenshot as context
  const attachScreenshot = useCallback(
    async (step: StepResult) => {
      if (!app) return;
      
      try {
        await app.callServerTool({
          name: "attach-screenshot",
          arguments: { 
            base64: step.screenshot,
            stepIndex: step.index,
            stepType: step.type,
            stepSelector: step.selector,
            stepValue: step.value,
            stepStatus: step.status,
            stepDuration: step.duration,
            stepUrl: step.url,
            stepError: step.error,
          },
        });
      } catch (err) {
        console.error("Failed to attach screenshot:", err);
      }
    },
    [app]
  );

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

  // Select a step: expand it, collapse others (accordion), and scroll into view
  const selectStep = useCallback((index: number) => {
    // Temporarily disable scroll sync to prevent observer from overwriting our selection
    setScrollSyncEnabled(false);
    setActiveStepIndex(index);
    // Accordion behavior: expand only this step, collapse others
    setExpandedSteps(new Set([index]));
    // Scroll the step into view if needed
    const stepEl = stepRefs.current.get(index);
    if (stepEl) {
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    // Re-enable scroll sync after scroll animation completes
    setTimeout(() => setScrollSyncEnabled(true), 500);
  }, []);

  // Store step element ref
  const setStepRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    if (el) {
      stepRefs.current.set(index, el);
    } else {
      stepRefs.current.delete(index);
    }
  }, []);

  // Auto-play functionality
  useEffect(() => {
    if (!isAutoPlaying || !data) {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
      return;
    }

    // Find steps with screenshots for auto-play
    const stepsWithScreenshots = data.steps
      .map((s, idx) => ({ ...s, arrayIndex: idx }))
      .filter(s => s.screenshot);

    autoPlayRef.current = setInterval(() => {
      setActiveStepIndex(prev => {
        // Find next step with screenshot
        const currentArrayIdx = stepsWithScreenshots.findIndex(s => s.arrayIndex === prev);
        const nextIdx = currentArrayIdx + 1;
        
        if (nextIdx >= stepsWithScreenshots.length) {
          // Stop at the end instead of looping
          setIsAutoPlaying(false);
          return prev;
        }
        
        return stepsWithScreenshots[nextIdx]?.arrayIndex ?? prev;
      });
    }, 1000);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [isAutoPlaying, data]);

  // Toggle autoplay
  const toggleAutoPlay = useCallback(() => {
    if (!isAutoPlaying && data) {
      // If starting playback, check if we're at the end and reset to beginning
      const stepsWithScreenshots = data.steps
        .map((s, idx) => ({ ...s, arrayIndex: idx }))
        .filter(s => s.screenshot);
      const currentIdx = stepsWithScreenshots.findIndex(s => s.arrayIndex === activeStepIndex);
      if (currentIdx >= stepsWithScreenshots.length - 1) {
        // At the end, reset to first screenshot
        const firstScreenshotIdx = stepsWithScreenshots[0]?.arrayIndex ?? 0;
        setActiveStepIndex(firstScreenshotIdx);
      }
    }
    setIsAutoPlaying(prev => !prev);
    // Disable scroll sync while playing to avoid conflicts
    setScrollSyncEnabled(prev => !prev ? true : prev);
  }, [isAutoPlaying, data, activeStepIndex]);

  // Scroll-based active step detection
  useEffect(() => {
    if (!scrollSyncEnabled || isAutoPlaying || !data) return;

    const stepsContainer = stepsContainerRef.current;
    if (!stepsContainer) return;

    // Create observer to detect which step is at the top
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible step
        let topmostTarget: Element | null = null;
        let topmostY = Infinity;

        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const rect = entry.boundingClientRect;
            if (rect.top < topmostY && rect.top >= 0) {
              topmostY = rect.top;
              topmostTarget = entry.target;
            }
          }
        });

        if (topmostTarget) {
          const stepIndex = parseInt((topmostTarget as HTMLElement).dataset.stepIndex || '0', 10);
          setActiveStepIndex(stepIndex);
        }
      },
      {
        root: null, // Use viewport
        rootMargin: '-100px 0px -50% 0px', // Top portion of viewport
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );

    // Observe all step elements
    stepRefs.current.forEach((el, idx) => {
      el.dataset.stepIndex = String(idx);
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [scrollSyncEnabled, isAutoPlaying, data]);

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
        <h1><span className="codicon codicon-beaker icon" /> Timeline</h1>
        <div className="header-actions">
          <button 
            onClick={() => setShowCarousel(!showCarousel)} 
            className={`vscode-button ${showCarousel ? "active" : "secondary"}`} 
            title="Toggle screenshot carousel"
          >
            <span className={`codicon ${showCarousel ? 'codicon-eye-closed' : 'codicon-eye'}`} /> {showCarousel ? 'Hide Preview' : 'Show Preview'}
          </button>
          {canFullscreen && (
            <button onClick={toggleFullscreen} className="vscode-button secondary" title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              <span className={`codicon ${isFullscreen ? 'codicon-screen-normal' : 'codicon-screen-full'}`} /> {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
          )}
        </div>
      </header>

      {/* Screenshot carousel */}
      {showCarousel && data.steps.length > 0 && (
        <ScreenshotCarousel
          steps={data.steps}
          activeIndex={activeStepIndex}
          isPlaying={isAutoPlaying}
          onStepSelect={selectStep}
          onTogglePlay={toggleAutoPlay}
        />
      )}

      <SummaryBar summary={data.summary} />

      <div className="timeline-steps" ref={stepsContainerRef}>
        {data.steps.map((step, idx) => (
          <StepCard
            key={step.index}
            step={step}
            isExpanded={expandedSteps.has(step.index)}
            isActive={idx === activeStepIndex}
            showScreenshot={!showCarousel}
            onSelect={() => {
              setIsAutoPlaying(false); // Stop autoplay when manually selecting
              selectStep(idx);
            }}
            onPreviewScreenshot={previewScreenshot}
            onSaveScreenshot={saveScreenshot}
            onAttachScreenshot={attachScreenshot}
            stepRef={setStepRef(idx)}
          />
        ))}
      </div>
    </div>
  );
}
