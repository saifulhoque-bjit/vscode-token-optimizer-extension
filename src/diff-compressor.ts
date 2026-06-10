export interface CompressedOutput {
    compressed: string;
    originalLines: number;
    compressedLines: number;
    type: string;  // 'diff' | 'log' | 'search' | 'json' | 'code' | 'signatures' | 'text'
    filesKept?: number;
    filesDropped?: number;
}

interface DiffFile {
    header: string;       // The "diff --git ..." line
    lines: string[];      // All lines belonging to this file section
    hunks: DiffHunk[];    // Parsed hunks
    changeCount: number;  // Total +/- lines
}

interface DiffHunk {
    header: string;       // @@ ... @@ line
    lines: string[];      // All lines in the hunk (context + changes)
    changeCount: number;  // Number of +/- lines in this hunk
}

function parseDiff(content: string): DiffFile[] {
    const lines = content.split('\n');
    const files: DiffFile[] = [];
    let currentFile: DiffFile | null = null;
    let currentHunk: DiffHunk | null = null;

    for (const line of lines) {
        if (line.startsWith('diff --git ')) {
            // Save previous file
            if (currentFile) {
                if (currentHunk) {
                    currentFile.hunks.push(currentHunk);
                }
                files.push(currentFile);
            }
            currentFile = {
                header: line,
                lines: [line],
                hunks: [],
                changeCount: 0
            };
            currentHunk = null;
        } else if (currentFile) {
            currentFile.lines.push(line);

            if (line.startsWith('@@ ')) {
                // Save previous hunk
                if (currentHunk) {
                    currentFile.hunks.push(currentHunk);
                }
                currentHunk = {
                    header: line,
                    lines: [line],
                    changeCount: 0
                };
            } else if (currentHunk) {
                currentHunk.lines.push(line);
                if (line.startsWith('+') || line.startsWith('-')) {
                    if (!line.startsWith('+++') && !line.startsWith('---')) {
                        currentHunk.changeCount++;
                        currentFile.changeCount++;
                    }
                }
            } else {
                // Lines before first hunk (like --- a/, +++ b/)
                // Still part of the file but not a hunk
            }
        }
    }

    // Save last file
    if (currentFile) {
        if (currentHunk) {
            currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
    }

    return files;
}

function trimHunkContext(hunk: DiffHunk, maxContext: number): string[] {
    const result: string[] = [];
    const lines = hunk.lines;

    // Always keep the @@ header
    if (lines.length > 0 && lines[0].startsWith('@@')) {
        result.push(lines[0]);
    }

    // Find change lines and keep context around them
    const changeIndices: number[] = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if ((line.startsWith('+') || line.startsWith('-')) &&
            !line.startsWith('+++') && !line.startsWith('---')) {
            changeIndices.push(i);
        }
    }

    if (changeIndices.length === 0) {
        // No changes, keep a few context lines
        const start = 1;
        const end = Math.min(1 + maxContext * 2, lines.length);
        for (let i = start; i < end; i++) {
            result.push(lines[i]);
        }
        if (end < lines.length) {
            result.push(`[... ${lines.length - end} more context lines ...]`);
        }
        return result;
    }

    // Build ranges to keep
    const keepRanges: [number, number][] = [];
    for (const idx of changeIndices) {
        const start = Math.max(1, idx - maxContext);
        const end = Math.min(lines.length, idx + maxContext + 1);
        keepRanges.push([start, end]);
    }

    // Merge overlapping ranges
    keepRanges.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const range of keepRanges) {
        if (merged.length === 0 || range[0] > merged[merged.length - 1][1]) {
            merged.push(range);
        } else {
            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], range[1]);
        }
    }

    // Build output with gaps marked
    for (let i = 0; i < merged.length; i++) {
        const [start, end] = merged[i];
        if (i === 0 && start > 1) {
            result.push(`[... ${start - 1} context lines ...]`);
        } else if (i > 0 && start > merged[i - 1][1]) {
            result.push(`[... ${start - merged[i - 1][1]} lines ...]`);
        }
        for (let j = start; j < end; j++) {
            result.push(lines[j]);
        }
    }

    const lastEnd = merged[merged.length - 1][1];
    if (lastEnd < lines.length) {
        result.push(`[... ${lines.length - lastEnd} context lines ...]`);
    }

    return result;
}

export function compressDiff(
    content: string,
    maxFiles: number = 10,
    maxHunks: number = 3,
    maxContext: number = 2
): CompressedOutput {
    const originalLines = content.split('\n').length;

    if (originalLines === 0) {
        return { compressed: '', originalLines: 0, compressedLines: 0, type: 'diff', filesKept: 0, filesDropped: 0 };
    }

    const files = parseDiff(content);

    // Sort by change count (most changed first)
    files.sort((a, b) => b.changeCount - a.changeCount);

    const filesKept = Math.min(files.length, maxFiles);
    const filesDropped = files.length - filesKept;

    const outputLines: string[] = [];

    // Process kept files
    for (let fi = 0; fi < filesKept; fi++) {
        const file = files[fi];

        // Select hunks: first, last, and highest-change middle ones
        const selectedHunks: DiffHunk[] = [];
        if (file.hunks.length <= maxHunks) {
            selectedHunks.push(...file.hunks);
        } else {
            // Always keep first and last
            selectedHunks.push(file.hunks[0]);

            // Find highest-change middle hunks
            const middleHunks = file.hunks.slice(1, -1);
            middleHunks.sort((a, b) => b.changeCount - a.changeCount);
            const middleSlots = maxHunks - 2; // 2 reserved for first + last
            for (let i = 0; i < Math.min(middleSlots, middleHunks.length); i++) {
                selectedHunks.push(middleHunks[i]);
            }
            selectedHunks.push(file.hunks[file.hunks.length - 1]);

            // Sort by original order
            selectedHunks.sort((a, b) => {
                const ai = file.hunks.indexOf(a);
                const bi = file.hunks.indexOf(b);
                return ai - bi;
            });
        }

        // Write file header lines (diff --git, --- a/, +++ b/)
        const headerLines: string[] = [];
        for (const line of file.lines) {
            headerLines.push(line);
            if (line.startsWith('+++ ')) {
                break;
            }
        }
        outputLines.push(...headerLines);

        // Write selected hunks with trimmed context
        let lastHunkIndex = -1;
        for (let hi = 0; hi < selectedHunks.length; hi++) {
            const hunk = selectedHunks[hi];
            const hunkIndex = file.hunks.indexOf(hunk);

            // Mark dropped hunks
            if (lastHunkIndex >= 0 && hunkIndex - lastHunkIndex > 1) {
                const droppedCount = hunkIndex - lastHunkIndex - 1;
                outputLines.push(`[... ${droppedCount} hunk(s) with ${file.hunks.slice(lastHunkIndex + 1, hunkIndex).reduce((s, h) => s + h.changeCount, 0)} changes ...]`);
            }

            const trimmed = trimHunkContext(hunk, maxContext);
            outputLines.push(...trimmed);
            lastHunkIndex = hunkIndex;
        }
    }

    if (filesDropped > 0) {
        outputLines.push(`\n[... ${filesDropped} more file(s) with changes dropped ...]`);
    }

    const compressed = outputLines.join('\n');
    const compressedLines = outputLines.length;

    return {
        compressed,
        originalLines,
        compressedLines,
        type: 'diff',
        filesKept,
        filesDropped
    };
}
