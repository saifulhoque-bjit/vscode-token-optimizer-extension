<div align="center">

# Copilot Token Optimizer

### VS Code extension that compresses Copilot Chat context automatically

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.90+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**10 compression techniques. Sidebar UI. Toggle on/off. Works with `@optimize`.**

[Install](#install) • [Usage](#usage) • [Sidebar UI](#sidebar-ui) • [Techniques](#techniques) • [Settings](#settings) • [FAQ](#faq)

---

</div>

## What Is This?

A VS Code extension with a **sidebar panel** that lets you toggle 10 token optimization techniques on/off. When enabled, it compresses code, diffs, logs, search results, and prompts before they reach the language model.

Use it through `@optimize` in Copilot Chat — the sidebar controls what techniques are active.

```
Sidebar (⚡ icon in activity bar):
  Master Switch: ON
  ✅ Context Compression
  ✅ Content-Aware Routing
  ✅ Diff Compressor
  ✅ Log Compressor
  ✅ Search Compressor
  ✅ Cache Alignment
  ✅ Concise Rewriting
  ✅ Structured Output
  ✅ Context Tracking

Copilot Chat:
  @optimize What does src/auth.py do?
  → [reads 8 signatures instead of 500 lines, same answer]
```

---

## Install

### Option 1: From .vsix file (recommended)

Download `vscode-copilot-token-optimizer-2.0.0.vsix` from [Releases](https://github.com/saifulhoque-bjit/vscode-token-optimizer-extension/releases), then:

```powershell
# Windows
code --install-extension vscode-copilot-token-optimizer-2.0.0.vsix

# Mac / Linux
code --install-extension vscode-copilot-token-optimizer-2.0.0.vsix
```

Or in VS Code:
1. Open Command Palette (Ctrl+Shift+P)
2. Type "Extensions: Install from VSIX..."
3. Select the .vsix file

### Option 2: Build from source

```bash
git clone https://github.com/saifulhoque-bjit/vscode-token-optimizer-extension.git
cd vscode-token-optimizer-extension
npm install
npm run build
npx vsce package --allow-missing-repository
code --install-extension vscode-copilot-token-optimizer-2.0.0.vsix
```

### Requirements

- VS Code 1.90 or later
- GitHub Copilot extension installed and active
- A Copilot subscription (the extension uses VS Code's built-in language model API)

---

## Usage

### Step 1: Open the Sidebar

After installing, you'll see a **⚡ (zap)** icon in VS Code's activity bar (left side). Click it to open the Token Optimizer sidebar.

### Step 2: Toggle Techniques

The sidebar shows a **master switch** at the top and **individual technique toggles** below:

- **Master ON** → all enabled techniques are active
- **Master OFF** → everything passes through unoptimized
- **Individual toggles** → enable/disable specific techniques

### Step 3: Use `@optimize` in Copilot Chat

Open Copilot Chat and prefix your question with `@optimize`:

```
@optimize What does src/auth.py do?
@optimize Review src/api/routes.ts for bugs
@optimize Explain the login flow in src/auth.py
@optimize Compare src/old.py and src/new.py
```

The extension reads the sidebar settings and applies only the enabled techniques.

### Step 4: Check Stats

After each request, the sidebar shows compression stats at the bottom:

```
Last request: 500 → 8 lines (98% reduction)
```

### Commands

| Command | Description |
|---------|-------------|
| `@optimize <prompt>` | Process prompt through enabled techniques |
| `Token Optimizer: Toggle All Optimizations` | Toggle master switch |
| `Token Optimizer: Clear Context` | Reset compressed file cache and Q&A history |

---

## Sidebar UI

The sidebar appears as a ⚡ icon in VS Code's activity bar.

```
┌─────────────────────────────┐
│ ⚡ Token Optimizer           │
│                        [ON] │
├─────────────────────────────┤
│ TECHNIQUES                  │
│                             │
│ 🗜️ Context Compression      │ [✓]
│ Extract function signatures │
│                             │
│ 🔀 Content-Aware Routing    │ [✓]
│ Diff/log/search/json/code   │
│                             │
│ 🔧 Diff Compressor          │ [✓]
│ Compress git diff output    │
│                             │
│ 📋 Log Compressor           │ [✓]
│ Compress build/test output  │
│                             │
│ 🔍 Search Compressor        │ [✓]
│ Compress grep/ripgrep       │
│                             │
│ ⚡ Cache Alignment           │ [✓]
│ Static prefix, dynamic tail │
│                             │
│ ✂️ Concise Rewriting         │ [✓]
│ Strip verbose phrases       │
│                             │
│ 📊 Structured Output        │ [✓]
│ Task-specific formats       │
│                             │
│ 🔄 Context Tracking         │ [✓]
│ Cross-turn memory           │
├─────────────────────────────┤
│ STATS                       │
│ Last: 500 → 8 lines        │
│ (98% reduction)             │
└─────────────────────────────┘
```

### How the toggles work

- **Master ON + technique ON** → technique is applied
- **Master ON + technique OFF** → technique is skipped
- **Master OFF** → everything passes through, no optimization
- Changes take effect immediately on the next `@optimize` request
- Settings are saved in VS Code workspace configuration

---

## Techniques

### 1. Context Compression

Extracts function/class signatures from code files. Instead of sending the full file to the model, only the skeleton is sent.

- Python: `def`, `class`, `async def` + imports
- JS/TS: `function`, `class`, `const ... = () =>`, `export` + imports
- Other: first N lines

**Savings:** 60-90% reduction in file context.

### 2. Content-Aware Routing

Detects the type of content and routes it to the right compressor:

| Type | Detection | Compressor |
|------|-----------|------------|
| `diff` | `diff --git`, `@@` hunks | Diff Compressor |
| `log` | `ERROR`, `FAIL`, `Traceback` | Log Compressor |
| `search` | `file:line:content` format | Search Compressor |
| `json` | JSON arrays/objects | Smart Crusher |
| `code` | `def`, `class`, `function` | Signature Extraction |
| `text` | default | Passthrough |

### 3. Diff Compressor

Compresses git diff output:

- Caps files (default: 10), sorted by change count
- Caps hunks per file (default: 3): first, last, highest-change
- Trims context lines (default: 2 each side)

**Savings:** 5-10x on diff output.

### 4. Log Compressor

Compresses build/test output (pytest, npm, cargo, jest, make):

- Classifies lines: ERROR(10), FAIL(10), WARN(5), STACK_TRACE(8), SUMMARY(7)
- Keeps lines with score >= 3
- Preserves full stack traces
- Adds `[... N lines compressed ...]` markers

**Savings:** 10-50x on log output.

### 5. Search Compressor

Compresses grep/ripgrep output:

- Scores matches by keyword relevance (error/warn/fail/security)
- Caps files (default: 15), matches per file (default: 5)
- Keeps first + last + highest-scored per file

**Savings:** 5-10x on search output.

### 6. Cache Alignment

Structures prompts with static context first, dynamic query last. Enables provider-side prefix caching for repeated queries.

**Savings:** 20-40% on repeated queries (provider dependent).

### 7. Concise Rewriting

Strips verbose phrases automatically:

- "Can you please help me" → removed
- "in order to" → "to"
- "at this point in time" → "now"
- Excess whitespace → compressed

**Savings:** 10-30% on verbose prompts.

### 8. Structured Output

Detects task type and adds response format instructions:

| Task | Format |
|------|--------|
| code | Clean code, minimal comments |
| analysis | `{purpose, params, returns, complexity}` |
| comparison | Table format |
| debug | `{issue, root_cause, fix, prevention}` |
| review | `{issues: [{file, line, severity, fix}], summary}` |

### 9. Context Tracking

Maintains state across conversation turns:

- Compressed file cache (no re-compression)
- Previous Q&A tracking
- Relevant context injection for follow-ups

### 10. CCR Pipeline

Orchestrates all techniques: Compress → Cache → Retrieve. The pipeline checks each technique's enabled state and skips disabled ones.

---

## Settings

All settings are in VS Code's settings under `tokenOptimizer`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `tokenOptimizer.enabled` | boolean | `true` | Master switch |
| `tokenOptimizer.compression` | boolean | `true` | Code signature extraction |
| `tokenOptimizer.contentRouter` | boolean | `true` | Content-aware routing |
| `tokenOptimizer.cacheAlign` | boolean | `true` | Static prefix alignment |
| `tokenOptimizer.conciseRewrite` | boolean | `true` | Verbose phrase removal |
| `tokenOptimizer.structuredOutput` | boolean | `true` | Task-specific formats |
| `tokenOptimizer.contextTracking` | boolean | `true` | Cross-turn memory |

Settings can also be changed from the sidebar UI or the Command Palette.

---

## Architecture

```
src/
├── extension.ts         — Entry point, registers sidebar + chat participant
├── sidebar-provider.ts  — WebviewViewProvider for sidebar UI
├── config-manager.ts    — VS Code settings read/write/events
├── pipeline.ts          — Main orchestrator (checks config, runs techniques)
├── compressor.ts        — Code → signature extraction
├── content-router.ts    — Content type detection + dispatch
├── diff-compressor.ts   — Git diff compression
├── log-compressor.ts    — Build/test output compression
├── search-compressor.ts — Grep/ripgrep compression
├── cache-aligner.ts     — Static system prefix
├── concise-rewriter.ts  — Verbose phrase stripping
├── structured-output.ts — Task detection + format instructions
└── context-tracker.ts   — Cross-turn state management
```

---

## FAQ

**Q: How do I open the sidebar?**
A: Click the ⚡ icon in VS Code's activity bar (left side). If you don't see it, right-click the activity bar and check "Token Optimizer".

**Q: Does this replace Copilot?**
A: No. It uses the same models via `vscode.lm` API. It's a preprocessing layer.

**Q: Do I need to use @optimize?**
A: Yes, prefix your chat messages with `@optimize` to activate compression. The sidebar controls which techniques are applied.

**Q: Can I use regular Copilot Chat without compression?**
A: Yes. Just don't use `@optimize`. Regular Copilot Chat is unaffected.

**Q: Which models does it support?**
A: Any model available through VS Code's language model API (GPT-4o, GPT-4, etc.).

**Q: Does it affect inline code suggestions?**
A: No. Only affects `@optimize` chat conversations.

**Q: How much can I save?**
A: Depends on content type. Code files: 60-90%. Diffs: 5-10x. Logs: 10-50x. Search: 5-10x. The sidebar shows actual stats after each request.

---

## License

MIT
