---
name: playwright-timeline
description: This skill guides development of the Playwright Timeline MCP App - a visual browser automation tool with interactive timeline UI. Use when working with playwright-run tool, timeline components, step replay, screenshot capture, or MCP Apps patterns in this project.
---

# Playwright Timeline MCP App

Build an interactive visual timeline for Playwright browser automation that runs inside MCP-enabled hosts like VS Code and Claude.

## Core Architecture

This MCP App follows the Tool + Resource pattern:

```
Host calls playwright-run → Server executes Playwright actions → Returns steps
→ Host renders timeline.html → UI displays step cards with screenshots
→ User can replay steps via callServerTool
```

## Project Structure

```
playwright-mcp-app/
├── main.ts              # Entry point (stdio transport)
├── server.ts            # Tool & resource registration
├── playwright-wrapper.ts # Instrumented Playwright runner
├── timeline.html        # App HTML + embedded CSS
├── src/
│   ├── main.tsx         # React entry
│   └── TimelineApp.tsx  # Timeline UI components
├── dist/                # Built output
└── package.json
```

## Key Patterns Used

### 1. Tool + Resource Linking

```typescript
const resourceUri = "ui://playwright/timeline.html";

registerAppTool(server, "playwright-run", {
  // ... tool config
  _meta: { ui: { resourceUri } },
}, handler);

registerAppResource(server, "name", resourceUri, { description }, readCallback);
```

### 2. App-Only Tools (Hidden from Model)

```typescript
registerAppTool(server, "replay-step", {
  _meta: { 
    ui: { 
      resourceUri,
      visibility: ["app"]  // Hidden from model, only callable by UI
    }
  },
}, handler);
```

### 3. Handler Registration Order

**CRITICAL:** Register ALL handlers BEFORE `app.connect()`:

```typescript
const app = new App({ name, version });

// 1. Streaming partial input (progress during LLM generation)
app.ontoolinputpartial = (params) => { /* show preview */ };

// 2. Complete input (before execution)
app.ontoolinput = (params) => { /* prepare UI */ };

// 3. Tool result (after execution)
app.ontoolresult = (result) => { /* display results */ };

// 4. Host context changes (theme, styles, safe area)
app.onhostcontextchanged = (ctx) => { /* apply styles */ };

// 5. Teardown (cleanup)
app.onteardown = async () => { /* cleanup */ return {}; };

// THEN connect
await app.connect();
```

### 4. Host Styling Integration

```typescript
import { 
  applyDocumentTheme, 
  applyHostStyleVariables, 
  applyHostFonts 
} from "@modelcontextprotocol/ext-apps/react";

app.onhostcontextchanged = (ctx) => {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.safeAreaInsets) {
    const { top, right, bottom, left } = ctx.safeAreaInsets;
    document.body.style.padding = `${top}px ${right}px ${bottom}px ${left}px`;
  }
};
```

### 5. Bidirectional Communication

```typescript
// UI calls server tool
const result = await app.callServerTool({
  name: "replay-step",
  arguments: { stepIndex: 0 },
});

// Update model context
await app.updateModelContext({
  content: [{ type: "text", text: "Timeline status: 5 passed, 1 failed" }],
});

// Send debug logs to host
await app.sendLog({ level: "info", data: "Step replayed successfully" });
```

## Tools Reference

| Tool | Visibility | Purpose |
|------|------------|---------|
| `playwright-run` | `["model", "app"]` | Execute actions, show timeline |
| `replay-step` | `["app"]` | Re-run a step from UI |
| `take-screenshot` | `["app"]` | Capture current state |
| `close-browser` | `["app"]` | End session |

## Build & Test

```bash
# Install dependencies
npm install
npx playwright install chromium

# Build
npm run build

# Development with hot reload
npm start

# Test with basic-host
git clone https://github.com/modelcontextprotocol/ext-apps.git /tmp/ext-apps
cd /tmp/ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
```

## Common Patterns

### Step Result Schema

```typescript
interface StepResult {
  index: number;
  type: "navigate" | "click" | "fill" | "wait" | "screenshot" | "hover" | "select";
  selector?: string;
  value?: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  screenshot?: string;  // base64
  error?: string;
  url?: string;
}
```

### Streaming Preview

Show placeholder steps as actions stream in:

```typescript
app.ontoolinputpartial = (params) => {
  const partialActions = params.arguments?.actions;
  // Render placeholder cards for each action
};
```

### Auto-Expand Failed Steps

```typescript
app.ontoolresult = (result) => {
  const failedSteps = new Set(
    result.structuredContent.steps
      .filter(s => s.status === "failed")
      .map(s => s.index)
  );
  setExpandedSteps(failedSteps);
};
```

## Debug Tips

1. Use `app.sendLog()` to send logs to the host application
2. Check browser DevTools for iframe-isolated errors
3. Verify `dist/timeline.html` is a self-contained single file
4. Ensure handler registration happens before `app.connect()`
