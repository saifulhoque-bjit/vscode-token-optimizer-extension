export interface CompressedFile {
    signatures: string[];
    originalLines: number;
    compressedLines: number;
    language: string;
}

export interface CompressedOutput {
    compressed: string;
    originalLines: number;
    compressedLines: number;
    type: string;
}

export function extractSignaturesAsOutput(content: string, language: string): CompressedOutput {
    const result = extractSignatures(content, language);
    return {
        compressed: result.signatures.join('\n'),
        originalLines: result.originalLines,
        compressedLines: result.compressedLines,
        type: 'signatures'
    };
}

const PYTHON_SIGNATURE_REGEX = /^(\s*)(def |class |async def )/;
const JS_TS_SIGNATURE_REGEX = /^(\s*)(export\s+)?(default\s+)?(function |class |const \w+\s*=\s*(?:async\s*)?\(|let \w+\s*=\s*(?:async\s*)?\(|var \w+\s*=\s*(?:async\s*)?\()/;

export function extractSignatures(content: string, language: string): CompressedFile {
    const lines = content.split('\n');
    const originalLines = lines.length;
    const signatures: string[] = [];

    const isPython = language === 'python';
    const regex = isPython ? PYTHON_SIGNATURE_REGEX : JS_TS_SIGNATURE_REGEX;

    // Extract import lines for context (first 20 lines or until non-import)
    const imports: string[] = [];
    for (const line of lines.slice(0, 50)) {
        const trimmed = line.trim();
        if (isPython && (trimmed.startsWith('import ') || trimmed.startsWith('from '))) {
            imports.push(trimmed);
        } else if (!isPython && (trimmed.startsWith('import ') || trimmed.startsWith('export '))) {
            if (trimmed.includes(' from ') || trimmed.startsWith('import {') || trimmed.startsWith('import ')) {
                imports.push(trimmed);
            }
        }
    }

    if (imports.length > 0) {
        signatures.push(`--- imports (${imports.length} lines) ---`);
        imports.slice(0, 15).forEach(i => signatures.push(i));
        if (imports.length > 15) {
            signatures.push(`... and ${imports.length - 15} more imports`);
        }
    }

    signatures.push('--- signatures ---');

    for (const line of lines) {
        if (regex.test(line)) {
            signatures.push(line.trimEnd());
        }
    }

    if (signatures.length === 1) {
        // Only has the header, add a note
        signatures.push(`(no ${language} signatures found)`);
    }

    return {
        signatures,
        originalLines,
        compressedLines: signatures.length,
        language
    };
}
