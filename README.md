# Playwright MCP App

A visual timeline UI for Playwright browser automation, built using the **MCP Apps** protocol. Displays step-by-step execution results with screenshots directly in VS Code, Claude, or any MCP Apps-compatible host.

## Features

- 🎭 **Visual Timeline** - See each Playwright action as an expandable card
- 📸 **Screenshots** - Automatic screenshot capture after each step
- 🔄 **Replay Steps** - Re-run individual steps from the UI
- 🎨 **Host Theming** - Adapts to VS Code/Claude light/dark themes
- ⚡ **Real-time Updates** - Streaming step results as they execute

## Architecture

```
┌─────────────────────────────────────────┐
│  VS Code / Claude (Host)                │
│  ┌───────────────────────────────────┐  │
│  │  Timeline UI (React + MCP Apps)   │  │
│  │  - StepCard components            │  │
│  │  - Screenshot modal               │  │
│  │  - Replay controls                │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ ui:// protocol
┌─────────────────┴───────────────────────┐
│  MCP Server (Node.js)                   │
│  - playwright-run (model-visible)       │
│  - replay-step (app-only)               │
│  - take-screenshot (app-only)           │
│  - Playwright browser automation        │
└─────────────────────────────────────────┘
```

## Quick Start

### 1. Install dependencies

```bash
npm install
npx playwright install chromium
```

### 2. Build the project

```bash
npm run build
```

### 3. Configure your MCP client

Add to your VS Code `settings.json` or Claude Desktop config:

```json
{
  "mcp": {
    "servers": {
      "playwright-timeline": {
        "command": "node",
        "args": ["/path/to/playwright-mcp-app/dist/main.js"]
      }
    }
  }
}
```

### 4. Use in chat

Ask your AI assistant:
> "Navigate to https://example.com and click the first link"

The model will call the `playwright-run` tool, and the timeline UI will appear in the chat!

## Development

### Start dev server with hot reload

```bash
npm start
```

This runs:
- Vite in watch mode for the UI
- tsx in watch mode for the server

### Test with basic-host

```bash
# In another terminal, clone and run the test host
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
npm start
```

Open http://localhost:8080, select `playwright-run`, and call it with:
```json
{
  "url": "https://example.com",
  "actions": [
    { "type": "screenshot" },
    { "type": "click", "selector": "a" }
  ]
}
```

## Tools

### `playwright-run` (Model-visible)

Main tool that runs Playwright actions and displays the timeline.

**Input:**
```typescript
{
  url: string;              // Starting URL
  actions: Array<{
    type: "click" | "fill" | "wait" | "screenshot" | "hover" | "select";
    selector?: string;      // CSS selector
    value?: string;         // Value for fill/select
    timeout?: number;       // Timeout in ms (default: 5000)
  }>;
  headless?: boolean;       // Run headless (default: true)
  captureScreenshots?: boolean; // Capture after each step (default: true)
}
```

### `replay-step` (App-only)

Re-execute a specific step. Only callable from the timeline UI.

### `take-screenshot` (App-only)

Capture current browser state. Only callable from the timeline UI.

### `close-browser` (App-only)

Close the browser session. Only callable from the timeline UI.

## License

MIT
