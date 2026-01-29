# Agent Skills

This project includes [Agent Skills](https://agentskills.io/) that guide AI coding agents through development tasks.

## Available Skills

| Skill | Description |
|-------|-------------|
| [`playwright-usage`](.github/skills/playwright-usage/SKILL.md) | **For host applications** - Guides effective use of the playwright-run tool |
| [`playwright-timeline`](.github/skills/playwright-timeline/SKILL.md) | **For developers** - Guides development/modification of the MCP App |

## Installation

### Option 1: Vercel Skills CLI

```bash
npx skills add ./
```

### Option 2: Manual

Copy `.github/skills/` to your agent's skills directory.

## Usage

Ask your AI coding agent:
- "How do I add a new tool to the Playwright MCP App?"
- "Show me the handler registration pattern"
- "Help me add fullscreen support"

The agent will use the skill to provide context-aware guidance.
