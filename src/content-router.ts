import { compressDiff } from './diff-compressor';
import { compressLog } from './log-compressor';
import { compressSearch } from './search-compressor';
import { extractSignatures } from './compressor';

export interface CompressedOutput {
    compressed: string;
    originalLines: number;
    compressedLines: number;
    type: string;
}

export type ContentType = 'diff' | 'log' | 'search' | 'json' | 'code' | 'text';

export function detectContentType(content: string): ContentType {
    if (!content || content.trim().length === 0) {
        return 'text';
    }

    const lines = content.split('\n');
    const totalLines = lines.length;

    // Diff detection
    if (/^diff --git\s/m.test(content) ||
        /^--- a\//m.test(content) ||
        /^\+\+\+ b\//m.test(content) ||
        /^@@\s+\d+/m.test(content)) {
        return 'diff';
    }

    // Log detection
    const logIndicators = [
        /\bERROR\b/m,
        /\bFAIL(ED|URE)?\b/m,
        /\bPASS(ED)?\b/m,
        /^Traceback/m,
        /^npm ERR!/m,
        /^cargo\s+test/m,
        /^={3,}\s.*\s={3,}$/m,
        /\btest\s+results?\b/mi,
        /\d+\s+(passed|failed|error|total)\b/mi
    ];
    let logScore = 0;
    for (const pattern of logIndicators) {
        if (pattern.test(content)) {
            logScore++;
        }
    }
    // Also check if >50% of lines start with common log prefixes
    let logPrefixCount = 0;
    for (const line of lines) {
        if (/^\[(INFO|DEBUG|ERROR|WARN)\]/i.test(line) ||
            /^\d{4}-\d{2}-\d{2}[T ]/.test(line) ||
            /^\d{2}:\d{2}:\d{2}/.test(line) ||
            /^(INFO|DEBUG|ERROR|WARN|TRACE)\s/.test(line)) {
            logPrefixCount++;
        }
    }
    if (logPrefixCount > totalLines * 0.5) {
        logScore += 2;
    }
    if (logScore >= 2) {
        return 'log';
    }

    // Search output detection
    const grepPattern = /^[\w./\\-]+:\d+:/m;
    let grepMatches = 0;
    for (const line of lines) {
        if (grepPattern.test(line)) {
            grepMatches++;
        }
    }
    if (grepMatches > 3 && grepMatches > totalLines * 0.3) {
        return 'search';
    }

    // JSON detection
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) &&
        (trimmed.endsWith('}') || trimmed.endsWith(']'))) {
        // Quick validity check: roughly balanced braces
        let braces = 0;
        let brackets = 0;
        let inString = false;
        let escaped = false;
        for (const ch of trimmed) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (ch === '{') braces++;
            if (ch === '}') braces--;
            if (ch === '[') brackets++;
            if (ch === ']') brackets--;
        }
        if (Math.abs(braces) <= 1 && Math.abs(brackets) <= 1) {
            return 'json';
        }
    }

    // Code detection
    const codePatterns = [
        /\bdef\s+\w+\s*\(/,
        /\bclass\s+\w+/,
        /\bfunction\s+\w+\s*\(/,
        /\bimport\s+[\w{'"]+/,
        /\bconst\s+\w+\s*=/,
        /\blet\s+\w+\s*=/,
        /\bvar\s+\w+\s*=/,
        /\bexport\s+(default\s+)?(function|class|const|let|var)\b/,
        /\breturn\s+/,
        /\bif\s*\(/,
        /\bfor\s*\(/,
        /\bwhile\s*\(/,
    ];
    let codeScore = 0;
    for (const pattern of codePatterns) {
        if (pattern.test(content)) {
            codeScore++;
        }
    }
    if (codeScore >= 3) {
        return 'code';
    }

    return 'text';
}

function compressJson(content: string): CompressedOutput {
    const originalLines = content.split('\n').length;

    try {
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
            // SmartCrusher approach: keep first 3 + last 3 items
            if (parsed.length <= 6) {
                return { compressed: content, originalLines, compressedLines: originalLines, type: 'json' };
            }

            const firstItems = parsed.slice(0, 3);
            const lastItems = parsed.slice(-3);
            const summary = [
                `[... ${parsed.length - 6} items omitted (${parsed.length} total) ...]`
            ];
            const result = JSON.stringify([...firstItems, ...summary, ...lastItems], null, 2);
            const compressedLines = result.split('\n').length;
            return { compressed: result, originalLines, compressedLines, type: 'json' };
        }

        if (typeof parsed === 'object' && parsed !== null) {
            const keys = Object.keys(parsed);
            if (keys.length > 20) {
                // Truncate large objects: keep first 20 keys
                const truncated: Record<string, unknown> = {};
                for (const key of keys.slice(0, 20)) {
                    truncated[key] = parsed[key];
                }
                truncated['[... truncated]'] = `${keys.length - 20} more keys omitted (${keys.length} total)`;
                const result = JSON.stringify(truncated, null, 2);
                const compressedLines = result.split('\n').length;
                return { compressed: result, originalLines, compressedLines, type: 'json' };
            }
        }

        // Small enough, return as-is
        return { compressed: content, originalLines, compressedLines: originalLines, type: 'json' };
    } catch {
        // Not valid JSON, return as-is
        return { compressed: content, originalLines, compressedLines: originalLines, type: 'json' };
    }
}

function compressCode(content: string): CompressedOutput {
    const originalLines = content.split('\n').length;

    // Detect language from content
    let lang = 'text';
    if (/\bdef\s+\w+|import\s+\w+|from\s+\w+\s+import/.test(content)) {
        lang = 'python';
    } else if (/\bfunction\s+\w+|const\s+\w+\s*=|import\s+.*\s+from\s+['"]/.test(content)) {
        lang = 'javascript';
    }

    const result = extractSignatures(content, lang);
    const compressed = result.signatures.join('\n');

    return {
        compressed,
        originalLines: result.originalLines,
        compressedLines: result.compressedLines,
        type: 'code'
    };
}

export function compressByType(content: string): CompressedOutput {
    const contentType = detectContentType(content);

    switch (contentType) {
        case 'diff':
            return compressDiff(content);
        case 'log':
            return compressLog(content);
        case 'search':
            return compressSearch(content);
        case 'json':
            return compressJson(content);
        case 'code':
            return compressCode(content);
        case 'text':
        default:
            return {
                compressed: content,
                originalLines: content.split('\n').length,
                compressedLines: content.split('\n').length,
                type: 'text'
            };
    }
}
