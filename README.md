# Playwright Timeline MCP App

A visual timeline UI for Playwright browser automation, built using the **MCP Apps** protocol. Displays step-by-step execution results with screenshots directly in VS Code, Claude, or any MCP Apps-compatible host.

## Why Playwright Timeline MCP?

Unlike running Playwright scripts directly, this MCP app gives you **visual feedback** at every step:
- **See what the browser sees** - Screenshots after each action help you verify the automation worked
- **Debug failures visually** - When a selector fails, see exactly what the page looked like
- **Share context with AI** - Attach screenshots to conversations so the AI can help fix issues
- **Review multi-step workflows** - Carousel view lets you scrub through a visual history

## Features

- 🎭 **Visual Timeline** - See each Playwright action as an expandable card
- 📸 **Screenshots** - Automatic screenshot capture after each step
- 🔄 **Carousel View** - Scrub through screenshots with keyboard navigation
- 🎨 **Host Theming** - Adapts to VS Code/Claude light/dark themes
- ⚡ **Real-time Streaming** - See steps appear as the model generates them
- 📎 **Attach to Context** - Send screenshots back to the AI for visual debugging
- 🎥 **Video Recording** - Record entire sessions for playback

## Architecture

```
┌─────────────────────────────────────────┐
│  VS Code / Claude (Host)                │
│  ┌───────────────────────────────────┐  │
│  │  Timeline UI (React + MCP Apps)   │  │
│  │  - StepCard components            │  │
│  │  - Screenshot carousel            │  │
│  │  - Attach to context              │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ ui:// protocol
┌─────────────────┴───────────────────────┐
│  MCP Server (Node.js)                   │
│  - playwright-run (model-visible)       │
│  - attach-screenshot (app-only)         │
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

Ask your AI assistant to automate a browser task, and the timeline UI will appear with visual results!

## Examples

These examples showcase scenarios where the **visual timeline** provides unique value over running Playwright scripts alone.

### 1. Verify a Multi-Step Checkout Flow

> "Test the checkout flow on my local e-commerce site: add an item to cart, go to checkout, fill in the shipping form, and verify the order summary shows correctly."

**Why Timeline MCP helps:** You can visually verify each step (cart icon updated, form filled correctly, summary displays right prices) without manual checking. Failed steps show exactly where the flow broke.

```json
{
  "url": "http://localhost:3000/products/widget",
  "actions": [
    { "type": "click", "selector": "[data-testid='add-to-cart']" },
    { "type": "click", "selector": "[data-testid='cart-icon']" },
    { "type": "click", "selector": "[data-testid='checkout-button']" },
    { "type": "fill", "selector": "#shipping-name", "value": "Test User" },
    { "type": "fill", "selector": "#shipping-address", "value": "123 Main St" },
    { "type": "screenshot" }
  ]
}
```

### 2. Debug a Broken Login Form

> "Try to log in with these credentials and show me what happens. The login is failing but I'm not sure why."

**Why Timeline MCP helps:** The screenshot after each step reveals the actual state - maybe an error toast appeared, maybe the button didn't enable, or maybe you're on the wrong page entirely. Attach the failing screenshot to ask the AI for help.

```json
{
  "url": "https://myapp.dev/login",
  "actions": [
    { "type": "fill", "selector": "#email", "value": "user@example.com" },
    { "type": "fill", "selector": "#password", "value": "password123" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "timeout": 2000 },
    { "type": "screenshot" }
  ]
}
```

### 3. Visual Comparison of UI States

> "Show me what the dashboard looks like before and after enabling dark mode."

**Why Timeline MCP helps:** The carousel view lets you flip between the two states, making it easy to spot visual differences. Save screenshots for documentation or bug reports.

```json
{
  "url": "https://myapp.dev/dashboard",
  "actions": [
    { "type": "screenshot" },
    { "type": "click", "selector": "[data-testid='theme-toggle']" },
    { "type": "wait", "timeout": 500 },
    { "type": "screenshot" }
  ]
}
```

### 4. Capture Form Validation Errors

> "Fill out this form with invalid data so I can see all the validation error messages."

**Why Timeline MCP helps:** You get a screenshot showing all validation errors at once, which you can then attach to context to ask the AI about improving error messages or fixing validation logic.

```json
{
  "url": "https://myapp.dev/signup",
  "actions": [
    { "type": "fill", "selector": "#email", "value": "not-an-email" },
    { "type": "fill", "selector": "#password", "value": "123" },
    { "type": "fill", "selector": "#phone", "value": "abc" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "screenshot" }
  ]
}
```

### 5. Test Responsive Behavior

> "Check how the navigation menu looks and behaves after clicking the hamburger menu on mobile viewport."

**Why Timeline MCP helps:** See the exact visual state after the menu opens. The timeline shows timing (500ms for animation) and you can verify the menu items are visible.

```json
{
  "url": "https://myapp.dev",
  "actions": [
    { "type": "screenshot" },
    { "type": "click", "selector": "[data-testid='hamburger-menu']" },
    { "type": "wait", "timeout": 500 },
    { "type": "screenshot" }
  ]
}
```

### 6. Document a Bug with Visual Evidence

> "The modal dialog is appearing behind the header. Capture this so I can file a bug report."

**Why Timeline MCP helps:** Get a screenshot proving the z-index issue, save it directly from the UI, and attach it to a GitHub issue. The timeline shows exactly which action triggered the bug.

```json
{
  "url": "https://myapp.dev/settings",
  "actions": [
    { "type": "click", "selector": "[data-testid='open-modal']" },
    { "type": "wait", "timeout": 300 },
    { "type": "screenshot" }
  ]
}
```

### 7. Verify Content After Navigation

> "Navigate through the docs site and verify each page loads correctly: Home → Getting Started → API Reference → Examples."

**Why Timeline MCP helps:** The carousel gives you a visual audit trail of each page. Failed navigations or 404s are immediately visible in the screenshots.

```json
{
  "url": "https://docs.myapp.dev",
  "actions": [
    { "type": "screenshot" },
    { "type": "click", "selector": "a[href='/getting-started']" },
    { "type": "screenshot" },
    { "type": "click", "selector": "a[href='/api-reference']" },
    { "type": "screenshot" },
    { "type": "click", "selector": "a[href='/examples']" },
    { "type": "screenshot" }
  ]
}
```

### 8. Debug Selector Issues with Visual Context

> "Click the submit button - I think my selector is wrong because it's not finding the element."

**Why Timeline MCP helps:** When the step fails, the screenshot shows what the page actually looks like. You can attach this to context and ask: "Here's the page - what selector should I use for the submit button?"

### 9. Record a Video Walkthrough

> "Record me completing the onboarding tutorial so I can share it with the team."

**Why Timeline MCP helps:** Enable video recording to capture the entire flow, then save the recording for documentation or async review.

```json
{
  "url": "https://myapp.dev/onboarding",
  "recordVideo": true,
  "actions": [
    { "type": "click", "selector": "[data-testid='next']" },
    { "type": "fill", "selector": "#name", "value": "Demo User" },
    { "type": "click", "selector": "[data-testid='next']" },
    { "type": "click", "selector": "[data-testid='finish']" }
  ]
}
```

### 10. Compare A/B Test Variants

> "Show me what the landing page looks like with the feature flag enabled vs disabled."

**Why Timeline MCP helps:** Run two separate executions (one with flag on, one off) and use the carousel to visually compare. Screenshots can be saved for stakeholder review.

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
  url: string;                     // Starting URL
  actions: Array<{
    type: "click" | "fill" | "wait" | "screenshot" | "hover" | "select" | "navigate";
    selector?: string;             // CSS selector or Playwright locator
    value?: string;                // Value for fill/select/navigate
    timeout?: number;              // Timeout in ms (default: 5000)
  }>;
  headless?: boolean;              // Run headless (default: true)
  captureScreenshots?: boolean;    // Capture after each step (default: true)
  screenshotFormat?: "png" | "jpeg"; // Screenshot format (default: png)
  screenshotQuality?: number;      // JPEG quality 0-100 (default: 80)
  recordVideo?: boolean;           // Record video of session (default: false)
}
```

### `run-with-preview` (Model-visible)

Run actions with live screencast preview (requires `headless: false`).

### `attach-screenshot` (App-only)

Attach a screenshot with step metadata as context for the AI conversation.

### `save-screenshot` (App-only)

Save a screenshot to the `playwright-screenshots/` directory.

### `preview-screenshot` (App-only)

Open a screenshot in your system's default image viewer.

### `close-browser` (App-only)

Close the browser session. If video recording was enabled, saves the video.

### `save-video` (App-only)

Save the recorded video to a specified path.

## License

MIT
