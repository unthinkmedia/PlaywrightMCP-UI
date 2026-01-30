/**
 * Playwright Timeline MCP App
 * 
 * Main React application that displays Playwright execution results
 * in a visual timeline format with live browser preview support.
 * Uses the MCP Apps SDK to communicate with the host.
 */

import { useEffect, useState, useCallback, useRef, Component, type ReactNode, type ErrorInfo } from "react";
import { App, type McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
} from "@modelcontextprotocol/ext-apps/react";

// ============================================================
// Error Boundary Component
// ============================================================
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Timeline Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="timeline-app loading">
          <span className="codicon codicon-error" style={{ fontSize: 32, color: 'var(--vscode-testing-iconFailed)' }} />
          <p style={{ fontWeight: 500 }}>Something went wrong</p>
          <p className="error">{this.state.error?.message || 'Unknown error'}</p>
          <button 
            className="vscode-button" 
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

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
  videoRecording?: boolean;
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
  onCopySelector: (selector: string) => void;
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
  onCopySelector,
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
        {step.value && step.type === "fill" && !isExpanded && (
          <code className="step-value-preview" title={step.value}>
            "{step.value.length > 20 ? step.value.slice(0, 20) + '...' : step.value}"
          </code>
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
                <span className="codicon codicon-clippy" />
              </button>
              {step.selector && (
                <button
                  className="icon-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopySelector(step.selector!);
                  }}
                  title="Copy selector"
                >
                  <span className="codicon codicon-copy" />
                </button>
              )}
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
  onPreviewScreenshot: (base64: string, stepIndex: number) => void;
  onSaveScreenshot: (base64: string, stepIndex: number) => void;
  onAttachScreenshot: (step: StepResult) => void;
  onCopySelector: (selector: string) => void;
}

function ScreenshotCarousel({ steps, activeIndex, isPlaying, onStepSelect, onTogglePlay, onPreviewScreenshot, onSaveScreenshot, onAttachScreenshot, onCopySelector }: ScreenshotCarouselProps) {
  const stepsWithScreenshots = steps.filter(s => s.screenshot);
  const currentStep = steps[activeIndex];
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  
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
      } else if (e.key === 'Escape') {
        // Let parent handle escape
        window.dispatchEvent(new CustomEvent('carousel-escape'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext, onTogglePlay]);

  // Auto-scroll thumbnails to keep active one visible
  useEffect(() => {
    if (thumbnailsRef.current) {
      const activeThumb = thumbnailsRef.current.querySelector('.thumbnail.active') as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeIndex]);

  const hasPrev = stepsWithScreenshots.some(s => s.index < activeIndex);
  const hasNext = stepsWithScreenshots.some(s => s.index > activeIndex);
  const isAtEnd = !hasNext && !isPlaying;

  return (
    <div className="screenshot-carousel">
      <div className="carousel-header">
        <span className="carousel-title">
          Step Screenshots
          <span className="carousel-counter">
            {currentScreenshotIndex >= 0 ? currentScreenshotIndex + 1 : 0} / {stepsWithScreenshots.length}
          </span>
        </span>
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
            <div 
              className={`carousel-image-wrapper ${isPlaying ? 'playing' : ''}`}
              onClick={isPlaying ? onTogglePlay : undefined}
              title={isPlaying ? 'Click to pause' : undefined}
            >
              <img
                src={`data:image/png;base64,${currentStep.screenshot}`}
                alt={`Step ${activeIndex}: ${currentStep.type}`}
                className="carousel-image"
              />
              {!isPlaying && (
                <button 
                  className="carousel-play-overlay"
                  onClick={onTogglePlay}
                  title={isAtEnd ? 'Replay slideshow (Space)' : 'Play slideshow (Space)'}
                >
                  <span className={`codicon ${isAtEnd ? 'codicon-debug-restart' : 'codicon-play'}`} />
                </button>
              )}
            </div>
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

      {/* Thumbnail strip */}
      <div className="carousel-thumbnails" ref={thumbnailsRef}>
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

      {/* Step info label */}
      {currentStep && (
        <div className="carousel-step-info">
          <div className="step-info-left">
            <span className={`step-badge codicon ${currentStep.status === 'passed' ? 'codicon-pass' : currentStep.status === 'failed' ? 'codicon-error' : 'codicon-circle-outline'} ${currentStep.status}`} />
            <span className="step-label">
              Step {currentStep.index}: {currentStep.type}
              {currentStep.selector && (
                <>
                  <code>{currentStep.selector}</code>
                  <button
                    className="icon-button small"
                    onClick={() => onCopySelector(currentStep.selector!)}
                    title="Copy selector"
                  >
                    <span className="codicon codicon-copy" />
                  </button>
                </>
              )}
            </span>
          </div>
          {currentStep.screenshot && (
            <div className="step-info-actions">
              <button
                className="icon-button"
                onClick={() => onPreviewScreenshot(currentStep.screenshot!, currentStep.index)}
                title="Preview in image viewer"
              >
                <span className="codicon codicon-eye" />
              </button>
              <button
                className="icon-button"
                onClick={() => onSaveScreenshot(currentStep.screenshot!, currentStep.index)}
                title="Save screenshot to file"
              >
                <span className="codicon codicon-save" />
              </button>
              <button
                className="icon-button"
                onClick={() => onAttachScreenshot(currentStep)}
                title="Attach as context"
              >
                <span className="codicon codicon-clippy" />
              </button>
            </div>
          )}
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
  const [showCarousel, setShowCarousel] = useState(false); // Show list view by default
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [scrollSyncEnabled] = useState(false); // Disabled - preview only changes on click
  const [isLoading, setIsLoading] = useState<string | null>(null); // Loading state for async operations
  const [isVideoRecording, setIsVideoRecording] = useState(false); // Track if video recording is active
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

      const structured = result.structuredContent as (TimelineData & { videoRecording?: boolean }) | undefined;
      if (structured?.steps) {
        setData(structured);
        // Auto-expand failed steps (use array index, not step.index)
        const failedSteps = new Set(
          structured.steps
            .map((s, idx) => ({ ...s, arrayIdx: idx }))
            .filter((s) => s.status === "failed")
            .map((s) => s.arrayIdx)
        );
        setExpandedSteps(failedSteps);
        
        // Track video recording state
        if (structured.videoRecording !== undefined) {
          setIsVideoRecording(structured.videoRecording);
        }
        
        // Keep list view by default, user can toggle to preview
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
      
      setIsLoading('Opening preview...');
      try {
        await app.callServerTool({
          name: "preview-screenshot",
          arguments: { base64, stepIndex },
        });
      } catch (err) {
        console.error("Failed to preview screenshot:", err);
      } finally {
        setIsLoading(null);
      }
    },
    [app]
  );

  // Save screenshot to file
  const saveScreenshot = useCallback(
    async (base64: string, stepIndex: number) => {
      if (!app) return;
      
      setIsLoading('Saving screenshot...');
      try {
        await app.callServerTool({
          name: "save-screenshot",
          arguments: { base64, stepIndex },
        });
      } catch (err) {
        console.error("Failed to save screenshot:", err);
      } finally {
        setIsLoading(null);
      }
    },
    [app]
  );

  // Attach screenshot as context
  const attachScreenshot = useCallback(
    async (step: StepResult) => {
      if (!app || !step.screenshot) return;
      
      try {
        // Build markdown with step information
        const lines: string[] = [];
        lines.push(`# Playwright Step ${step.index}`);
        lines.push('');
        lines.push(`**Action:** ${step.type}`);
        if (step.selector) {
          lines.push(`**Selector:** \`${step.selector}\``);
        }
        if (step.value) {
          lines.push(`**Value:** ${step.value}`);
        }
        const statusEmoji = step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
        lines.push(`**Status:** ${statusEmoji} ${step.status}`);
        lines.push(`**Duration:** ${step.duration}ms`);
        if (step.url) {
          lines.push(`**URL:** ${step.url}`);
        }
        if (step.error) {
          lines.push('');
          lines.push('## Error');
          lines.push('```');
          lines.push(step.error);
          lines.push('```');
        }
        
        // Use updateModelContext to properly attach as context for next prompt
        await app.updateModelContext({
          content: [
            { 
              type: "image", 
              data: step.screenshot, 
              mimeType: "image/png" 
            },
            {
              type: "text",
              text: lines.join('\n'),
            },
          ],
        });
        
        app.sendLog({ 
          level: "info", 
          data: `Attached step ${step.index} screenshot as context` 
        }).catch(() => {});
      } catch (err) {
        console.error("Failed to attach screenshot:", err);
      }
    },
    [app]
  );

  // Copy selector to clipboard
  const copySelector = useCallback(
    async (selector: string) => {
      try {
        await navigator.clipboard.writeText(selector);
        setIsLoading('Copied!');
        setTimeout(() => setIsLoading(null), 1000);
      } catch (err) {
        console.error("Failed to copy selector:", err);
      }
    },
    []
  );

  // Download video recording
  const downloadVideo = useCallback(
    async () => {
      if (!app) return;
      
      setIsLoading('Preparing video download...');
      try {
        const result = await app.callServerTool({
          name: "get-video",
          arguments: {},
        });
        
        const structured = result.structuredContent as {
          hasVideo: boolean;
          videoData?: string;
          videoFilename?: string;
          error?: string;
        };
        
        if (structured?.hasVideo && structured.videoData) {
          // Create blob from base64 data
          const byteCharacters = atob(structured.videoData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'video/webm' });
          
          // Trigger download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = structured.videoFilename || 'playwright-recording.webm';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          setIsLoading('Video downloaded!');
          setTimeout(() => setIsLoading(null), 2000);
        } else {
          setIsLoading(structured?.error || 'No video available');
          setTimeout(() => setIsLoading(null), 3000);
        }
      } catch (err) {
        console.error("Failed to download video:", err);
        setIsLoading('Failed to download video');
        setTimeout(() => setIsLoading(null), 3000);
      }
    },
    [app]
  );

  // Listen for escape key from carousel to collapse it
  useEffect(() => {
    const handleCarouselEscape = () => {
      setShowCarousel(false);
    };
    window.addEventListener('carousel-escape', handleCarouselEscape);
    return () => window.removeEventListener('carousel-escape', handleCarouselEscape);
  }, []);

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
    setActiveStepIndex(index);
    // Toggle behavior: if already expanded, collapse; otherwise expand this and collapse others
    setExpandedSteps(prev => {
      if (prev.has(index)) {
        // Already expanded - collapse it
        return new Set();
      }
      // Expand only this step
      return new Set([index]);
    });
    // Scroll the step into view if needed
    const stepEl = stepRefs.current.get(index);
    if (stepEl) {
      stepEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
          <div className="button-group">
            <button 
              onClick={() => setShowCarousel(false)} 
              className={`icon-button ${!showCarousel ? "active" : ""}`} 
              title="List view"
            >
              <span className="codicon codicon-list-unordered" />
            </button>
            <button 
              onClick={() => setShowCarousel(true)} 
              className={`icon-button ${showCarousel ? "active" : ""}`} 
              title="Preview"
            >
              <span className="codicon codicon-eye" />
            </button>
          </div>
          {isVideoRecording && (
            <button onClick={downloadVideo} className="vscode-button secondary" title="Download recorded video">
              <span className="codicon codicon-device-camera-video" /> Download Video
            </button>
          )}
          {canFullscreen && (
            <button onClick={toggleFullscreen} className="vscode-button secondary" title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              <span className={`codicon ${isFullscreen ? 'codicon-screen-normal' : 'codicon-screen-full'}`} /> {isFullscreen ? "Exit" : "Fullscreen"}
            </button>
          )}
        </div>
      </header>

      <SummaryBar summary={data.summary} />

      {/* Screenshot carousel */}
      {showCarousel && data.steps.length > 0 && (
        <ScreenshotCarousel
          steps={data.steps}
          activeIndex={activeStepIndex}
          isPlaying={isAutoPlaying}
          onStepSelect={selectStep}
          onTogglePlay={toggleAutoPlay}
          onPreviewScreenshot={previewScreenshot}
          onSaveScreenshot={saveScreenshot}
          onAttachScreenshot={attachScreenshot}
          onCopySelector={copySelector}
        />
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="loading-toast">
          <span className="codicon codicon-loading spin" />
          {isLoading}
        </div>
      )}

      {/* List view - shown when preview is off */}
      {!showCarousel && (
        <div className="timeline-steps" ref={stepsContainerRef}>
          {data.steps
            .map((step, idx) => ({ step, originalIdx: idx })) // Preserve original index
            .filter(({ step }) => step.type !== "screenshot") // Hide standalone screenshot steps (redundant with auto-capture)
            .map(({ step, originalIdx }) => (
            <StepCard
              key={step.index}
              step={step}
              isExpanded={expandedSteps.has(originalIdx)}
              isActive={originalIdx === activeStepIndex}
              showScreenshot={true}
              onSelect={() => {
                setIsAutoPlaying(false); // Stop autoplay when manually selecting
                selectStep(originalIdx);
              }}
              onPreviewScreenshot={previewScreenshot}
              onSaveScreenshot={saveScreenshot}
              onAttachScreenshot={attachScreenshot}
              onCopySelector={copySelector}
              stepRef={setStepRef(originalIdx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Export wrapped with ErrorBoundary for use in main.tsx
export function TimelineAppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <TimelineApp />
    </ErrorBoundary>
  );
}
