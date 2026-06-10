import * as vscode from 'vscode';
import { CompressedFile } from './compressor';

interface QAEntry {
    question: string;
    answer: string;
    timestamp: number;
}

export class ContextTracker {
    private compressedFiles = new Map<string, CompressedFile>();
    private previousQA: QAEntry[] = [];
    private maxQAEntries = 10;

    addCompressedFile(path: string, compressed: CompressedFile): void {
        this.compressedFiles.set(path, compressed);
    }

    getCompressedFile(path: string): CompressedFile | undefined {
        return this.compressedFiles.get(path);
    }

    addQA(question: string, answer: string): void {
        this.previousQA.push({ question, answer, timestamp: Date.now() });
        if (this.previousQA.length > this.maxQAEntries) {
            this.previousQA.shift();
        }
    }

    getRelevantContext(currentQuestion: string): string {
        if (this.previousQA.length === 0) {return '';}

        const words = currentQuestion.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const relevant: string[] = [];

        for (const qa of this.previousQA) {
            const qLower = qa.question.toLowerCase();
            const matchCount = words.filter(w => qLower.includes(w)).length;
            if (matchCount >= 1) {
                relevant.push(`Q: ${qa.question}\nA: ${qa.answer.substring(0, 200)}`);
            }
        }

        if (relevant.length === 0) {return '';}
        return `### Previous Context\n${relevant.slice(-3).join('\n---\n')}`;
    }

    detectFileReferences(prompt: string): string[] {
        const regex = /\b[\w\/\-\.]+\.(py|js|ts|tsx|jsx|html|css|json|md)\b/g;
        const matches: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(prompt)) !== null) {
            matches.push(match[0]);
        }
        return [...new Set(matches)];
    }

    resolveFilePath(ref: string, workspaceRoot: string): string | null {
        try {
            // If already absolute
            if (ref.match(/^[A-Z]:\\/i) || ref.startsWith('/')) {
                return ref;
            }
            // Relative to workspace
            const joined = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), ref);
            return joined.fsPath;
        } catch {
            return null;
        }
    }

    clear(): void {
        this.compressedFiles.clear();
        this.previousQA = [];
    }
}
