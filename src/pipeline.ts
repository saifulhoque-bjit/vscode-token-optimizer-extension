import * as vscode from 'vscode';
import { extractSignatures, CompressedFile } from './compressor';
import { buildStaticPrefix, buildOptimizedPrompt } from './cache-aligner';
import { rewriteConcise } from './concise-rewriter';
import { detectTaskType, buildStructuredInstructions } from './structured-output';
import { ContextTracker } from './context-tracker';

const FILE_LANG_MAP: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.md': 'markdown'
};

function getLanguageForFile(filePath: string): string {
    for (const [ext, lang] of Object.entries(FILE_LANG_MAP)) {
        if (filePath.endsWith(ext)) {return lang;}
    }
    return 'text';
}

export class OptimizationPipeline {
    constructor(private tracker: ContextTracker) {}

    async process(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<void> {
        const userPrompt = request.prompt;
        if (!userPrompt) {
            stream.markdown('Please provide a prompt.');
            return;
        }

        let totalOriginalLines = 0;
        let totalCompressedLines = 0;
        const allSignatures: string[] = [];

        // Step 1: Detect file references
        const fileRefs = this.tracker.detectFileReferences(userPrompt);

        // Step 2: Read and compress referenced files
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? '';

        for (const ref of fileRefs) {
            const existing = this.tracker.getCompressedFile(ref);
            if (existing) {
                totalOriginalLines += existing.originalLines;
                totalCompressedLines += existing.compressedLines;
                allSignatures.push(`\n**${ref}** (${existing.language}):`);
                existing.signatures.forEach(s => allSignatures.push(s));
                continue;
            }

            const resolved = this.tracker.resolveFilePath(ref, workspaceRoot);
            if (!resolved) {continue;}

            try {
                const uri = vscode.Uri.file(resolved);
                const doc = await vscode.workspace.openTextDocument(uri);
                const content = doc.getText();
                const lang = getLanguageForFile(resolved);
                const compressed = extractSignatures(content, lang);

                this.tracker.addCompressedFile(ref, compressed);
                totalOriginalLines += compressed.originalLines;
                totalCompressedLines += compressed.compressedLines;

                allSignatures.push(`\n**${ref}** (${compressed.language}, ${compressed.originalLines} → ${compressed.compressedLines} lines):`);
                compressed.signatures.forEach(s => allSignatures.push(s));
            } catch {
                stream.markdown(`> ⚠️ Could not read file: \`${ref}\`\n\n`);
            }
        }

        // Step 3: Rewrite concise
        const concisePrompt = rewriteConcise(userPrompt);

        // Step 4: Build optimized prompt
        const staticPrefix = buildStaticPrefix();
        const compressedContext = allSignatures.length > 0 ? allSignatures.join('\n') : '';
        const { system, user } = buildOptimizedPrompt(staticPrefix, compressedContext, concisePrompt);

        // Step 5: Detect task type and get structured instructions
        const taskType = detectTaskType(concisePrompt);
        const structuredInstructions = buildStructuredInstructions(taskType);

        // Step 6: Get relevant context from previous turns
        const relevantContext = this.tracker.getRelevantContext(concisePrompt);

        // Step 7: Build final system message
        let finalSystem = system + '\n\n' + structuredInstructions;
        if (relevantContext) {
            finalSystem += '\n\n' + relevantContext;
        }

        // Step 8: Select model and send request
        let model: vscode.LanguageModelChat | undefined;
        try {
            const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
            model = models[0];
        } catch {
            // fallback
        }
        if (!model) {
            try {
                const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
                model = models[0];
            } catch {
                // fallback
            }
        }
        if (!model) {
            try {
                const models = await vscode.lm.selectChatModels();
                model = models[0];
            } catch {
                // no models
            }
        }

        if (!model) {
            stream.markdown('No language model available. Please ensure Copilot is enabled and a model is selected.');
            return;
        }

        const messages = [
            vscode.LanguageModelChatMessage.User(finalSystem + '\n\n' + user)
        ];

        try {
            const response = await model.sendRequest(messages, {}, token);
            let fullAnswer = '';

            // Step 9: Stream response
            for await (const fragment of response.text) {
                stream.markdown(fragment);
                fullAnswer += fragment;
            }

            // Step 10: Track Q&A
            this.tracker.addQA(concisePrompt, fullAnswer);

            // Step 11: Report compression stats
            if (totalOriginalLines > 0) {
                const savings = Math.round((1 - totalCompressedLines / totalOriginalLines) * 100);
                stream.markdown(`\n\n---\n*📊 Token optimization: ${fileRefs.length} file(s) compressed ${totalOriginalLines} → ${totalCompressedLines} lines (${savings}% reduction). Task type: ${taskType}.*`);
            } else {
                stream.markdown(`\n\n---\n*📊 Optimized prompt (task: ${taskType}). Concise rewrite: "${concisePrompt}"*`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            stream.markdown(`\n\nError calling language model: ${message}`);
        }
    }
}
