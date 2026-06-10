export interface CompressedOutput {
    compressed: string;
    originalLines: number;
    compressedLines: number;
    type: string;
}

type LogLevel = 'ERROR' | 'FAIL' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE' | 'SUMMARY' | 'STACK_TRACE' | 'NORMAL';

interface ClassifiedLine {
    text: string;
    level: LogLevel;
    score: number;
    isPartOfStack: boolean;
}

const LEVEL_SCORES: Record<LogLevel, number> = {
    'ERROR': 10,
    'FAIL': 10,
    'WARN': 5,
    'STACK_TRACE': 8,
    'SUMMARY': 7,
    'INFO': 1,
    'DEBUG': 0.5,
    'TRACE': 0.1,
    'NORMAL': 0
};

function classifyLine(line: string): { level: LogLevel; score: number } {
    const trimmed = line.trim();

    // Stack trace patterns
    if (/^\s*(Traceback|thread\s+\d+|goroutine\s+\d+)/i.test(line)) {
        return { level: 'STACK_TRACE', score: LEVEL_SCORES['STACK_TRACE'] };
    }
    if (/^\s+at\s+/.test(line) || /^\s+File\s+/.test(line)) {
        return { level: 'STACK_TRACE', score: LEVEL_SCORES['STACK_TRACE'] };
    }
    if (/^\s+\w+Error:/.test(line) || /^\s+\w+Exception:/.test(line)) {
        return { level: 'STACK_TRACE', score: LEVEL_SCORES['STACK_TRACE'] };
    }

    // Error patterns
    if (/\bERROR\b/i.test(trimmed) || /\bfatal\b/i.test(trimmed) || /\bpanic\b/i.test(trimmed)) {
        return { level: 'ERROR', score: LEVEL_SCORES['ERROR'] };
    }
    if (/^npm ERR!/i.test(trimmed) || /^cargo error/i.test(trimmed)) {
        return { level: 'ERROR', score: LEVEL_SCORES['ERROR'] };
    }

    // Fail patterns
    if (/\bFAIL\b/i.test(trimmed) || /\bFAILED\b/i.test(trimmed) || /\bFAILURE\b/i.test(trimmed)) {
        return { level: 'FAIL', score: LEVEL_SCORES['FAIL'] };
    }
    if (/\bassertion\s*(error|failed)\b/i.test(trimmed)) {
        return { level: 'FAIL', score: LEVEL_SCORES['FAIL'] };
    }

    // Summary patterns (check before WARN since summaries may contain "error" word)
    if (/\d+\s+(passed|failed|error|total|skipped)/i.test(trimmed) || /\bsummary\b/i.test(trimmed)) {
        return { level: 'SUMMARY', score: LEVEL_SCORES['SUMMARY'] };
    }
    if (/^={3,}\s/.test(trimmed) || /={3,}$/.test(trimmed)) {
        return { level: 'SUMMARY', score: LEVEL_SCORES['SUMMARY'] };
    }
    if (/^-{3,}\s/.test(trimmed) || /test\s*results?\b/i.test(trimmed)) {
        return { level: 'SUMMARY', score: LEVEL_SCORES['SUMMARY'] };
    }

    // Warn patterns
    if (/\bWARN(ING)?\b/i.test(trimmed)) {
        return { level: 'WARN', score: LEVEL_SCORES['WARN'] };
    }

    // Debug patterns
    if (/\bDEBUG\b/i.test(trimmed)) {
        return { level: 'DEBUG', score: LEVEL_SCORES['DEBUG'] };
    }

    // Trace patterns
    if (/\bTRACE\b/i.test(trimmed)) {
        return { level: 'TRACE', score: LEVEL_SCORES['TRACE'] };
    }

    // Info patterns
    if (/\bINFO\b/i.test(trimmed) || /\bPASS\b/i.test(trimmed) || /\bOK\b/i.test(trimmed)) {
        return { level: 'INFO', score: LEVEL_SCORES['INFO'] };
    }

    // Common log prefixes
    if (/^\[\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{2}:\d{2}:\d{2}/.test(trimmed)) {
        return { level: 'INFO', score: LEVEL_SCORES['INFO'] };
    }
    if (/^\[INFO\]/i.test(trimmed) || /^\[DEBUG\]/i.test(trimmed) || /^\[ERROR\]/i.test(trimmed)) {
        return { level: 'INFO', score: LEVEL_SCORES['INFO'] };
    }

    return { level: 'NORMAL', score: 0 };
}

function detectStackTraceRegions(lines: ClassifiedLine[]): void {
    // Mark lines that are part of stack traces
    let inStack = false;
    let stackIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.level === 'STACK_TRACE') {
            inStack = true;
            line.isPartOfStack = true;
            // Determine indent level for continuation
            const match = line.text.match(/^(\s+)/);
            stackIndent = match ? match[1].length : 0;
        } else if (inStack) {
            // Check if this line continues the stack trace
            const match = line.text.match(/^(\s+)/);
            const indent = match ? match[1].length : 0;

            // Empty line or deeper/maintained indent after stack = still part of trace
            if (line.text.trim() === '' || indent > stackIndent) {
                line.isPartOfStack = true;
            } else if (indent <= stackIndent && line.text.trim() !== '') {
                // Less indented non-empty line = end of stack
                inStack = false;
                line.isPartOfStack = false;
            }
        }
    }

    // Also look backwards: lines indented after an error line are likely stack
    let lastErrorIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].level === 'ERROR' || lines[i].level === 'FAIL') {
            lastErrorIdx = i;
        } else if (lastErrorIdx >= 0 && i - lastErrorIdx < 20) {
            const trimmed = lines[i].text.trim();
            if (trimmed === '') {
                continue; // blank line, could be between error and stack
            }
            const match = lines[i].text.match(/^(\s+)/);
            const indent = match ? match[1].length : 0;
            if (indent >= 4 || /^\s+(at|File|line|in)\s/i.test(lines[i].text)) {
                lines[i].isPartOfStack = true;
                lines[i].score = Math.max(lines[i].score, LEVEL_SCORES['STACK_TRACE']);
            } else if (!/^\s/.test(lines[i].text)) {
                lastErrorIdx = -1; // Non-indented non-empty line ends the region
            }
        }
    }
}

export function compressLog(content: string, minScore: number = 3): CompressedOutput {
    const rawLines = content.split('\n');
    const originalLines = rawLines.length;

    if (originalLines === 0) {
        return { compressed: '', originalLines: 0, compressedLines: 0, type: 'log' };
    }

    // Classify all lines
    const classified: ClassifiedLine[] = rawLines.map(line => {
        const { level, score } = classifyLine(line);
        return { text: line, level, score, isPartOfStack: false };
    });

    // Detect stack trace regions
    detectStackTraceRegions(classified);

    // Build output: keep lines with score >= minScore or that are part of a stack trace
    const outputLines: string[] = [];
    let droppedCount = 0;

    for (let i = 0; i < classified.length; i++) {
        const line = classified[i];

        if (line.score >= minScore || line.isPartOfStack) {
            // Flush dropped count marker
            if (droppedCount > 0) {
                outputLines.push(`[... ${droppedCount} lines compressed ...]`);
                droppedCount = 0;
            }
            outputLines.push(line.text);
        } else {
            droppedCount++;
        }
    }

    // Final dropped count
    if (droppedCount > 0) {
        outputLines.push(`[... ${droppedCount} lines compressed ...]`);
    }

    const compressed = outputLines.join('\n');
    const compressedLines = outputLines.length;

    return {
        compressed,
        originalLines,
        compressedLines,
        type: 'log'
    };
}
