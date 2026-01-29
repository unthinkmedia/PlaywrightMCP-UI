# GitHub Copilot Instructions

This is a **Playwright MCP App** project following the [MCP Apps specification](https://github.com/modelcontextprotocol/ext-apps).

## Key Concepts

- **MCP Apps** = Tool + UI Resource linked via `_meta.ui.resourceUri`
- **Tool** handles server logic, **Resource** serves bundled HTML UI
- **App SDK** (`@modelcontextprotocol/ext-apps`) connects UI to host

## Code Patterns

### Server (server.ts)
- `registerAppTool()` - Register tools with optional `visibility: ["app"]` for UI-only tools
- `registerAppResource()` - Serve bundled HTML from `dist/timeline.html`
- Always return `content` array for text fallback + `structuredContent` for UI

### Client (TimelineApp.tsx)
- Register handlers BEFORE `app.connect()`: `ontoolinputpartial`, `ontoolinput`, `ontoolresult`, `onhostcontextchanged`, `onteardown`
- Use `app.callServerTool()` for UI-to-server communication
- Apply host styles with `applyDocumentTheme()`, `applyHostStyleVariables()`

## Build System
- Vite + `vite-plugin-singlefile` bundles HTML+CSS+JS into one file
- Server TypeScript compiled separately via `tsconfig.server.json`
