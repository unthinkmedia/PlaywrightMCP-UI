```skill
---
name: Playwright Browser Automation
description: This skill guides effective use of the playwright-run tool for browser automation tasks. Use when the user asks to automate a website, fill forms, click buttons, take screenshots, test web pages, scrape data, or perform any browser-based actions. Provides patterns for action sequences, selector strategies, and error handling.
---

# Playwright Browser Automation

Automate browsers to navigate websites, interact with elements, and capture screenshots using the `playwright-run` tool.

## When to Use

Use `playwright-run` when the user wants to:
- Navigate to and interact with websites
- Fill out forms, click buttons, or select options
- Capture screenshots of pages or elements
- Test web page behavior
- Scrape visible content from pages
- Automate repetitive web tasks

## Tool Reference

### playwright-run

Execute browser automation actions and display results in a visual timeline.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | Starting URL (must be valid URL with protocol) |
| `actions` | array | Yes | Sequence of actions to execute |
| `headless` | boolean | No | Run browser without GUI (default: true) |
| `captureScreenshots` | boolean | No | Screenshot after each action (default: true) |

**Action Types:**

| Type | Required Fields | Description |
|------|-----------------|-------------|
| `click` | `selector` | Click an element |
| `fill` | `selector`, `value` | Type text into an input |
| `select` | `selector`, `value` | Select dropdown option |
| `hover` | `selector` | Hover over element |
| `wait` | `selector` or `timeout` | Wait for element or duration |
| `screenshot` | - | Capture current viewport |

## Action Patterns

### Form Submission

```json
{
  "url": "https://example.com/login",
  "actions": [
    { "type": "fill", "selector": "input[name='email']", "value": "user@example.com" },
    { "type": "fill", "selector": "input[name='password']", "value": "password123" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "selector": ".dashboard", "timeout": 10000 }
  ]
}
```

### Navigation with Verification

```json
{
  "url": "https://example.com",
  "actions": [
    { "type": "click", "selector": "nav a[href='/products']" },
    { "type": "wait", "selector": ".product-list" },
    { "type": "screenshot" }
  ]
}
```

### Search Flow

```json
{
  "url": "https://example.com",
  "actions": [
    { "type": "fill", "selector": "input[type='search']", "value": "search term" },
    { "type": "click", "selector": "button.search-submit" },
    { "type": "wait", "selector": ".search-results", "timeout": 5000 },
    { "type": "screenshot" }
  ]
}
```

### Dropdown Selection

```json
{
  "url": "https://example.com/form",
  "actions": [
    { "type": "select", "selector": "select#country", "value": "US" },
    { "type": "select", "selector": "select#state", "value": "CA" }
  ]
}
```

## Selector Strategies

Use robust selectors that won't break with minor page changes:

| Strategy | Example | Reliability |
|----------|---------|-------------|
| `data-testid` | `[data-testid='submit-btn']` | ⭐⭐⭐ Best |
| `aria-label` | `[aria-label='Search']` | ⭐⭐⭐ Best |
| `role + name` | `button:has-text('Submit')` | ⭐⭐⭐ Best |
| `name attr` | `input[name='email']` | ⭐⭐ Good |
| `type attr` | `input[type='submit']` | ⭐⭐ Good |
| `id` | `#login-form` | ⭐⭐ Good |
| `class combo` | `.btn.primary` | ⭐ Fragile |

**Playwright-specific selectors:**
- `text=Submit` - Match by visible text
- `button:has-text('Login')` - Element containing text
- `input >> visible=true` - Only visible elements
- `.form >> input[name='email']` - Scoped selector

## Best Practices

### 1. Always Wait for Elements

Add explicit waits after actions that trigger navigation or dynamic content:

```json
{ "type": "click", "selector": ".load-more" },
{ "type": "wait", "selector": ".new-content", "timeout": 5000 }
```

### 2. Start with Key Screenshots

Capture the initial state and after important transitions:

```json
{ "type": "screenshot" },  // Initial state
{ "type": "click", "selector": ".submit" },
{ "type": "wait", "selector": ".success" },
{ "type": "screenshot" }   // Final state
```

### 3. Handle Dynamic Content

For pages with loading states:

```json
{ "type": "wait", "selector": ".loading", "timeout": 1000 },  // Wait for loader
{ "type": "wait", "selector": ".content:not(.loading)", "timeout": 10000 }  // Wait for content
```

### 4. Use Appropriate Timeouts

- Form inputs: 2-3 seconds
- Page navigation: 5-10 seconds
- Heavy data loading: 15-30 seconds

## Common Scenarios

### E-commerce Checkout

```json
{
  "url": "https://shop.example.com/cart",
  "actions": [
    { "type": "screenshot" },
    { "type": "click", "selector": "button.checkout" },
    { "type": "wait", "selector": ".checkout-form" },
    { "type": "fill", "selector": "#email", "value": "customer@example.com" },
    { "type": "fill", "selector": "#address", "value": "123 Main St" },
    { "type": "select", "selector": "#country", "value": "US" },
    { "type": "screenshot" }
  ]
}
```

### Multi-Page Navigation

```json
{
  "url": "https://example.com",
  "actions": [
    { "type": "click", "selector": "a[href='/about']" },
    { "type": "wait", "selector": "h1:has-text('About')" },
    { "type": "screenshot" },
    { "type": "click", "selector": "a[href='/contact']" },
    { "type": "wait", "selector": "form.contact" },
    { "type": "screenshot" }
  ]
}
```

### Testing Login Flow

```json
{
  "url": "https://app.example.com/login",
  "captureScreenshots": true,
  "actions": [
    { "type": "fill", "selector": "#username", "value": "testuser" },
    { "type": "fill", "selector": "#password", "value": "testpass" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "selector": ".user-dashboard", "timeout": 10000 }
  ]
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Element not found | Add `wait` action before interaction, check selector |
| Click has no effect | Element may be covered - try `hover` first |
| Form not submitting | Look for submit button selector, may need `wait` |
| Timeout errors | Increase timeout value or check if element exists |
| Wrong element clicked | Make selector more specific |

## Timeline UI Features

After execution, the timeline UI displays:

- **Step cards** showing each action with status (passed/failed)
- **Screenshots** captured at each step (expandable)
- **Error details** for failed steps
- **Replay button** to re-run individual steps
- **Summary** with pass/fail counts and total duration

Use the timeline to:
- Verify correct elements were targeted
- Debug failed steps with screenshots
- Replay specific steps to test fixes
```
