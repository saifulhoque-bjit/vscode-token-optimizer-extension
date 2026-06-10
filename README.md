<div align="center">

# Copilot Token Optimizer

### VS Code extension that optimizes every Copilot Chat prompt automatically

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![VS Code](https://img.shields.io/badge/VS%20Code-1.90+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**6 optimization techniques. Zero manual effort. Type `@optimize` and go.**

[Install](#install) • [Usage](#usage) • [How It Works](#how-it-works) • [Techniques](#techniques) • [Architecture](#architecture) • [FAQ](#faq)

---

</div>

## What Is This?

A VS Code extension that registers `@optimize` as a chat participant in Copilot Chat. When you ask a question through `@optimize`, the extension automatically applies 6 token optimization techniques before sending your prompt to the language model.

This is a **real VS Code extension** — not a skill file or behavioral instruction. Every technique runs as actual code.

```
You:     @optimize What does src/auth.py do?

Extension internally:
  1. Detects src/auth.py in your prompt
  2. Reads the file and extracts 8 function signatures (instead of 500 lines)
  3. Rewrites your prompt to be concise
  4. Builds a static system prefix for cache alignment
  5. Detects this is an "explain" task, adds structured output instructions
  6. Checks previous conversation for relevant context
  7. Sends optimized prompt to the language model
  8. Streams response back with compression stats

You see:  Clean answer + "📊 1 file(s) compressed 500 → 8 lines (98% reduction)"
```

---

## Install

### From .vsix file

```powershell
# Windows
code --install-extension vscode-copilot-token-optimizer-1.0.0.vsix

# Mac / Linux
code --install-extension vscode-copilot-token-optimizer-1.0.0.vsix
```

### Build from source

```bash
git clone https://github.com/saifulhoque-bjit/vscode-token-optimizer-extension.git
cd vscode-token-optimizer-extension
npm install
npm run build
npx vsce package
code --install-extension vscode-copilot-token-optimizer-1.0.0.vsix
```

### Requirements

- VS Code 1.90 or later
- GitHub Copilot extension installed and active
- A Copilot subscription (the extension uses VS Code's built-in language model API)

---

## Usage

### Basic usage

Open Copilot Chat and type:

```
@optimize What does src/auth.py do?
```

The extension processes your prompt through all 6 techniques and streams the response.

### With file references

```
@optimize Explain the login flow in src/auth.py
@optimize Review src/api/routes.ts for bugs
@optimize Compare src/old.py and src/new.py
```

The extension detects file paths, reads the files, extracts signatures, and sends compressed context instead of full files.

### Multi-turn conversations

```
You:     @optimize What does src/auth.py do?
Copilot: [answers from 8 signatures]

You:     @optimize How does the validate_token function work?
Copilot: [reads only that function, references previous answer]
```

The extension tracks context across turns — compressed files stay cached, previous Q&A is referenced instead of re-explained.

### Clear context

If you want to reset the tracked context:

```
Command Palette → Optimize: Clear Optimization Context
```

Or use the command: `optimize.clearContext`

---

## How It Works

### Pipeline

Every `@optimize` request goes through this pipeline:

```
User prompt
    │
    ▼
┌─────────────────────┐
│ 1. File Detection   │  Find file paths in the prompt (.py, .js, .ts, etc.)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 2. Compression      │  Read files, extract signatures + content-aware compress
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 3. Concise Rewrite  │  Strip verbose phrases from the prompt
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. Cache Alignment  │  Build static system prefix + dynamic user query
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 5. Structured Output│  Detect task type, add response format instructions
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 6. Context Tracking │  Retrieve relevant previous Q&A
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Language Model API  │  Send optimized prompt, stream response
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Stats Footer        │  Report compression stats
└─────────────────────┘
```

### Model selection

The extension tries models in this order:
1. `gpt-4o` (preferred)
2. `gpt-4` (fallback)
3. Any available model (last resort)

If no model is available, it shows an error message asking you to enable Copilot.

---

## Techniques

### 1. Context Compression

**What it does:** Reads code files referenced in your prompt and extracts function/class signatures. The full file body is stripped — only the skeleton remains.

**How:** Regex-based extraction for Python (`def`, `class`, `async def`) and JS/TS (`function`, `class`, `const ... = () =>`, `export`). Also extracts import statements for context.

**Example:**
```python
# Original file (150 lines)
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)

# ... 148 more lines ...

# Compressed output (3 lines)
--- imports (2 lines) ---
import math
from typing import List
--- signatures ---
def fibonacci(n)
def is_prime(n)
class DataProcessor
```

**Savings:** 60-90% reduction in lines sent to the model.

### 2. Content-Aware Routing

**What it does:** Detects the type of content (diff, log, search results, JSON, code) and routes it to a specialized compressor. Instead of treating everything as code, each content type gets optimized differently.

**Supported content types:**

| Type | Detection | Compressor | Savings |
|------|-----------|------------|---------|
| `diff` | `diff --git`, `@@` hunks | Diff Compressor | 5-10x |
| `log` | `ERROR`, `FAIL`, `Traceback`, build output | Log Compressor | 10-50x |
| `search` | `file:line:content` grep format | Search Compressor | 5-10x |
| `json` | JSON arrays/objects | Smart Crusher (first+last items) | 3-10x |
| `code` | `def`, `class`, `function` | Signature Extraction | 60-90x |
| `text` | default | Passthrough | 1x |

### 3. Diff Compressor

**What it does:** Compresses git diff / unified diff output by parsing the format and keeping only the most important parts.

**How:**
- Parses `diff --git`, `--- a/`, `+++ b/`, `@@` hunk headers
- Caps files (default: 10), sorted by change count (most changed first)
- Caps hunks per file (default: 3): keeps first, last, and highest-change middle hunk
- Trims context lines around changes (default: 2 lines each side)

**Example:**
```diff
# Original: 500-line diff across 20 files
# Compressed: 45 lines across 10 most-changed files, 3 hunks each

diff --git a/src/auth.py b/src/auth.py
@@ -42,2 +42,5 @@ def login(user, pass):
+    validate_token(token)
+    check_permissions(user)
```

### 4. Log Compressor

**What it does:** Compresses build and test output (pytest, npm, cargo, jest, make) by keeping only errors, failures, warnings, and stack traces.

**How:**
- Classifies each line: ERROR(10), FAIL(10), WARN(5), STACK_TRACE(8), SUMMARY(7), INFO(1), DEBUG(0.5)
- Keeps lines with score >= 3 (errors, failures, warnings, stack traces, summaries)
- Preserves full stack traces (doesn't drop mid-trace lines)
- Adds `[... N lines compressed ...]` markers

**Example:**
```
# Original: 10,000-line test output
# Compressed: 50 lines (errors + stack traces + summary)

FAILED tests/test_auth.py::test_login - AssertionError: ...
  File "tests/test_auth.py", line 42, in test_login
    assert result == expected
[... 9,945 lines compressed ...]
=== 1 failed, 847 passed in 12.3s ===
```

### 5. Search Compressor

**What it does:** Compresses grep/ripgrep search output by scoring matches and keeping the most relevant ones.

**How:**
- Parses `file:line:content` format
- Scores matches higher for error/warn/fail/exception/bug/security keywords
- Caps files (default: 15), caps matches per file (default: 5)
- Always keeps first + last match per file, fills with highest-scored
- Adds `[... N more matches in file]` summaries

**Example:**
```
# Original: 200 grep matches across 30 files
# Compressed: 40 matches across 15 files

src/auth.py:42:    raise AuthenticationError("invalid token")
src/auth.py:87:    except TokenExpiredError:
[... 12 more matches in file ]
src/api/routes.ts:15:  // TODO: fix security issue
```

### 7. Cache Alignment

**What it does:** Structures the prompt so the static system instructions come first, and the dynamic user query comes last. This enables provider-side prefix caching.

**How:** Builds a consistent system prompt that describes the assistant's role and guidelines. The user's specific question goes at the end. Repeated queries with the same system prefix hit the cache.

**System prefix:**
```
You are an expert code assistant. Analyze code for correctness, performance,
and readability. Provide structured, concise answers. When reviewing code,
focus on bugs, security issues, and performance problems.
```

**Savings:** 20-40% on repeated queries (provider cache dependent).

### 8. Concise Rewriting

**What it does:** Automatically strips verbose phrases from your prompt before sending it to the model.

**What it removes:**
- Polite prefixes: "Can you please help me" → removed
- Polite suffixes: "Thank you" → removed
- Wordy phrases: "in order to" → "to", "at this point in time" → "now"
- Excess whitespace

**Example:**
```
Before: "Can you please help me write a function that in order to sorts a list? Thank you."
After:  "Write a function that to sorts a list."
```

**Note:** Short prompts (<50 chars) are not modified.

### 9. Structured Output

**What it does:** Detects what type of task you're asking for and adds specific response format instructions.

**Task types and formats:**

| Task | Detection | Format Instruction |
|------|-----------|-------------------|
| `code` | "write", "create", "implement", "add" | Clean code, minimal comments, short functions |
| `analysis` | "analyze", "what does", "explain" | `{purpose, params, returns, complexity}` |
| `comparison` | "compare", "vs", "difference", "which" | Table: `| Aspect | Option A | Option B |` |
| `debug` | "bug", "error", "fix", "broken", "issue" | `{issue, root_cause, fix, prevention}` |
| `explain` | "how does", "why does", "walk me through" | What (1-2 sentences), Why, How |
| `generate` | "generate", "scaffold", "create" | Clean code, no boilerplate |
| `review` | "review", "check", "look at" | `{issues: [{file, line, severity, fix}], summary}` |

### 10. Context Tracking

**What it does:** Maintains state across conversation turns:
- **Compressed file cache:** Files already compressed are reused without re-reading
- **Previous Q&A tracking:** Past questions and answers are stored
- **Relevant context retrieval:** When you ask a follow-up, relevant previous Q&A is injected into the system prompt

**Example:**
```
Turn 1: @optimize What does src/auth.py do?
        [compresses, answers, stores Q&A]

Turn 2: @optimize How does the login function work?
        [retrieves Turn 1 context, reads only login function, references previous answer]
```

### 11. CCR Pipeline

**What it does:** Orchestrates all techniques into a single pipeline (Compress → Cache → Retrieve):
1. Compress file references
2. Cache-align the prompt structure
3. Retrieve relevant context from previous turns
4. Send to language model
5. Track the Q&A for future retrieval

---

## Architecture

### File structure

```
src/
├── extension.ts         — Entry point, registers chat participant and commands
├── pipeline.ts          — Main orchestrator, runs all techniques in sequence
├── compressor.ts        — Code → signature extraction (Python, JS, TS)
├── content-router.ts    — Detects content type, routes to right compressor
├── diff-compressor.ts   — Compresses git diff output (caps files/hunks/context)
├── log-compressor.ts    — Compresses build/test output (keeps errors/stacks)
├── search-compressor.ts — Compresses grep output (scores + caps matches)
├── cache-aligner.ts     — Builds static system prefix + dynamic prompt
├── concise-rewriter.ts  — Strips verbose phrases from user prompts
├── structured-output.ts — Task detection + response format instructions
└── context-tracker.ts   — Cross-turn state: compressed files, Q&A history
```

### Module dependencies

```
extension.ts
    └── pipeline.ts
            ├── compressor.ts
            ├── cache-aligner.ts
            ├── concise-rewriter.ts
            ├── structured-output.ts
            └── context-tracker.ts
```

### APIs used

| API | Purpose |
|-----|---------|
| `vscode.chat.createChatParticipant` | Register `@optimize` in Copilot Chat |
| `vscode.lm.selectChatModels` | Select GPT-4o / GPT-4 / any available model |
| `model.sendRequest` | Send optimized prompt to the language model |
| `vscode.workspace.openTextDocument` | Read files for compression |
| `vscode.commands.registerCommand` | Register `clearContext` command |

### No external dependencies

The extension uses only VS Code built-in APIs. No npm runtime dependencies. The only devDependencies are `@types/vscode` and `typescript`.

---

## Commands

| Command | Description |
|---------|-------------|
| `@optimize <prompt>` | Process prompt through all 6 optimizations |
| `Optimize: Clear Optimization Context` | Reset compressed file cache and Q&A history |

---

## FAQ

**Q: How is this different from the Copilot skill (`/optimize`)?**
A: The skill (`/optimize`) is a SKILL.md file that tells Copilot to run a Python script. This extension is a real VS Code extension that runs all 6 techniques as compiled TypeScript. The skill only does compression. This extension does compression + cache-align + concise rewriting + structured output + context tracking + CCR pipeline.

**Q: Does this replace Copilot?**
A: No. It uses the same language models Copilot uses (via `vscode.lm` API). Think of it as a preprocessing layer that optimizes your prompt before the model sees it.

**Q: Which models does it support?**
A: Any model available through VS Code's language model API. It tries GPT-4o first, then GPT-4, then any available model.

**Q: Does it affect inline code suggestions?**
A: No. Only affects `@optimize` chat conversations.

**Q: Can I use it alongside regular Copilot Chat?**
A: Yes. Use `@optimize` when you want optimized prompts. Use regular Copilot Chat when you don't.

**Q: How much can I save?**
A: The compression script typically reduces file context by 60-90%. The other techniques (concise rewriting, cache alignment) provide additional savings depending on your prompting style.

---

## License

MIT
