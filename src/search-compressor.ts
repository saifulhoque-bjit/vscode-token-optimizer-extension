export interface CompressedOutput {
    compressed: string;
    originalLines: number;
    compressedLines: number;
    type: string;
}

interface SearchMatch {
    file: string;
    lineNum: string;
    content: string;
    rawLine: string;
    score: number;
}

interface FileMatches {
    file: string;
    matches: SearchMatch[];
}

const HIGH_VALUE_KEYWORDS = [
    'error', 'warn', 'fail', 'exception', 'bug', 'security',
    'vulnerability', 'critical', 'fatal', 'panic', 'crash',
    'todo', 'fixme', 'hack', 'xxx', 'danger', 'unsafe',
    'injection', 'xss', 'csrf', 'overflow', 'leak'
];

function scoreMatch(content: string): number {
    const lower = content.toLowerCase();
    let score = 1; // base score
    for (const kw of HIGH_VALUE_KEYWORDS) {
        if (lower.includes(kw)) {
            score += 3;
        }
    }
    return score;
}

function parseSearchLines(content: string): { matches: SearchMatch[]; nonMatchLines: string[] } {
    const lines = content.split('\n');
    const matches: SearchMatch[] = [];
    const nonMatchLines: string[] = [];

    // Pattern 1: file:line:content (standard grep -n)
    const grepPattern = /^([^:\s][^:]*):(\d+):(.*)$/;
    // Pattern 2: file:line-content (ripgrep context)
    const rgSepPattern = /^([^:\s][^:]*):(\d+)[-](.*)$/;
    // Pattern 3: file-line-content (ripgrep with -)
    const rgDashPattern = /^([^:\s][^:]+)-(\d+)[-:](.*)$/;
    // Separator lines from rg -C context
    const separatorPattern = /^[-=]{3,}$/;

    for (const line of lines) {
        if (separatorPattern.test(line.trim())) {
            nonMatchLines.push(line);
            continue;
        }

        let match = grepPattern.exec(line);
        if (match) {
            matches.push({
                file: match[1],
                lineNum: match[2],
                content: match[3],
                rawLine: line,
                score: scoreMatch(match[3])
            });
            continue;
        }

        match = rgSepPattern.exec(line);
        if (match) {
            matches.push({
                file: match[1],
                lineNum: match[2],
                content: match[3],
                rawLine: line,
                score: scoreMatch(match[3])
            });
            continue;
        }

        match = rgDashPattern.exec(line);
        if (match) {
            matches.push({
                file: match[1],
                lineNum: match[2],
                content: match[3],
                rawLine: line,
                score: scoreMatch(match[3])
            });
            continue;
        }

        nonMatchLines.push(line);
    }

    return { matches, nonMatchLines };
}

function groupByFile(matches: SearchMatch[]): FileMatches[] {
    const fileMap = new Map<string, SearchMatch[]>();
    for (const m of matches) {
        if (!fileMap.has(m.file)) {
            fileMap.set(m.file, []);
        }
        fileMap.get(m.file)!.push(m);
    }

    const groups: FileMatches[] = [];
    for (const [file, fileMatches] of fileMap) {
        groups.push({ file, matches: fileMatches });
    }

    // Sort files by total match score (highest first)
    groups.sort((a, b) => {
        const scoreA = a.matches.reduce((s, m) => s + m.score, 0);
        const scoreB = b.matches.reduce((s, m) => s + m.score, 0);
        return scoreB - scoreA;
    });

    return groups;
}

function selectMatchesForFile(fileMatches: SearchMatch[], maxMatches: number): { kept: SearchMatch[]; dropped: number } {
    if (fileMatches.length <= maxMatches) {
        return { kept: fileMatches, dropped: 0 };
    }

    // Always keep first and last
    const kept: SearchMatch[] = [fileMatches[0]];
    const dropped = fileMatches.length - maxMatches;

    if (maxMatches >= 2) {
        // Fill middle slots with highest-scored
        const middle = fileMatches.slice(1, -1);
        middle.sort((a, b) => b.score - a.score);
        const middleSlots = maxMatches - 2;
        for (let i = 0; i < Math.min(middleSlots, middle.length); i++) {
            kept.push(middle[i]);
        }
        kept.push(fileMatches[fileMatches.length - 1]);

        // Sort back to original order
        kept.sort((a, b) => {
            const ai = fileMatches.indexOf(a);
            const bi = fileMatches.indexOf(b);
            return ai - bi;
        });
    }

    return { kept, dropped };
}

export function compressSearch(
    content: string,
    maxFiles: number = 15,
    maxMatchesPerFile: number = 5
): CompressedOutput {
    const originalLines = content.split('\n').length;

    if (originalLines === 0) {
        return { compressed: '', originalLines: 0, compressedLines: 0, type: 'search' };
    }

    const { matches } = parseSearchLines(content);

    if (matches.length === 0) {
        // Not valid search output, return as-is
        return { compressed: content, originalLines, compressedLines: originalLines, type: 'search' };
    }

    const fileGroups = groupByFile(matches);
    const filesKept = Math.min(fileGroups.length, maxFiles);
    const outputLines: string[] = [];

    for (let fi = 0; fi < filesKept; fi++) {
        const group = fileGroups[fi];
        const { kept, dropped } = selectMatchesForFile(group.matches, maxMatchesPerFile);

        for (const m of kept) {
            outputLines.push(m.rawLine);
        }

        if (dropped > 0) {
            outputLines.push(`[... ${dropped} more matches in ${group.file} ...]`);
        }
    }

    if (fileGroups.length > maxFiles) {
        const totalDroppedMatches = fileGroups.slice(maxFiles).reduce((s, g) => s + g.matches.length, 0);
        outputLines.push(`[... ${fileGroups.length - maxFiles} more files with ${totalDroppedMatches} matches ...]`);
    }

    const compressed = outputLines.join('\n');
    const compressedLines = outputLines.length;

    return {
        compressed,
        originalLines,
        compressedLines,
        type: 'search'
    };
}
