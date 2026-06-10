import * as vscode from 'vscode';
import { extractSignatures, CompressedFile } from './compressor';
import { buildStaticPrefix, buildOptimizedPrompt } from './cache-aligner';
import { rewriteConcise } from './concise-rewriter';
import { detectTaskType, buildStructuredInstructions } from './structured-output';
import { ContextTracker } from './context-tracker';
import { compressByType, detectContentType, CompressedOutput } from './content-router';
import { OptimizationConfig } from './config-manager';

export interface PipelineStats {
    originalLines: number;
    compressedLines: number;
    fileCount: number;
    taskType: string;
}

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
        if (filePath.endsWith(ext)) { return lang; }
    }
    return 'text';
}

export class OptimizationPipeline {
    constructor(
        private tracker: ContextTracker,
        private onStats?: (stats: PipelineStats) => void
    ) {}

    async process(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken,
        config: OptimizationConfig
    ): Promise<void> {
        const userPrompt = request.prompt;
        if (!userPrompt) {
            stream.markdown('Please provide a prompt.');
            return;
        }

        // If master switch is off, pass through directly with tools
        if (!config.enabled) {
            const model = await this._selectModel(request);
            if (!model) {
                stream.markdown('No language model available. Please ensure Copilot is enabled and a model is selected.');
                return;
            }

            const messages = [vscode.LanguageModelChatMessage.User(userPrompt)];
            await this._sendWithToolLoop(model, messages, request, stream, token);
            return;
        }

        let totalOriginalLines = 0;
        let totalCompressedLines = 0;
        const allSignatures: string[] = [];
        const contentCompressions: { type: string; original: number; compressed: number }[] = [];
        let fileCount = 0;

        // Step 1: Detect file references (only if compression enabled)
        const fileRefs = config.compression ? this.tracker.detectFileReferences(userPrompt) : [];

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
                fileCount++;
                continue;
            }

            const resolved = this.tracker.resolveFilePath(ref, workspaceRoot);
            if (!resolved) { continue; }

            try {
                const uri = vscode.Uri.file(resolved);
                const doc = await vscode.workspace.openTextDocument(uri);
                const content = doc.getText();
                const lang = getLanguageForFile(resolved);
                const compressed = extractSignatures(content, lang);

                this.tracker.addCompressedFile(ref, compressed);
                totalOriginalLines += compressed.originalLines;
                totalCompressedLines += compressed.compressedLines;
                fileCount++;

                allSignatures.push(`\n**${ref}** (${compressed.language}, ${compressed.originalLines} → ${compressed.compressedLines} lines):`);
                compressed.signatures.forEach(s => allSignatures.push(s));

                // Step 2b: Content-type-aware compression (only if contentRouter enabled)
                if (config.contentRouter) {
                    const contentType = detectContentType(content);
                    if (contentType !== 'text' && contentType !== 'code') {
                        const typeResult = compressByType(content);
                        if (typeResult.compressedLines < typeResult.originalLines) {
                            contentCompressions.push({
                                type: typeResult.type,
                                original: typeResult.originalLines,
                                compressed: typeResult.compressedLines
                            });
                            allSignatures.push(`\n**[${contentType} compression]** (${typeResult.originalLines} → ${typeResult.compressedLines} lines):`);
                            allSignatures.push(typeResult.compressed);
                        }
                    }
                }
            } catch {
                stream.markdown(`> ⚠️ Could not read file: \`${ref}\`\n\n`);
            }
        }

        // Step 3: Rewrite concise (only if conciseRewrite enabled)
        const concisePrompt = config.conciseRewrite ? rewriteConcise(userPrompt) : userPrompt;

        // Step 3b: Detect and compress non-file content in the user prompt (only if contentRouter enabled)
        if (config.contentRouter) {
            const promptContentType = detectContentType(userPrompt);
            if (promptContentType !== 'text' && promptContentType !== 'code') {
                const promptResult = compressByType(userPrompt);
                if (promptResult.compressedLines < promptResult.originalLines) {
                    contentCompressions.push({
                        type: promptResult.type,
                        original: promptResult.originalLines,
                        compressed: promptResult.compressedLines
                    });
                    allSignatures.push(`\n**[pasted ${promptResult.type}]** (${promptResult.originalLines} → ${promptResult.compressedLines} lines):`);
                    allSignatures.push(promptResult.compressed);
                }
            }
        }

        // Step 4: Build optimized prompt (only if cacheAlign enabled)
        const staticPrefix = config.cacheAlign ? buildStaticPrefix() : '';
        const compressedContext = allSignatures.length > 0 ? allSignatures.join('\n') : '';
        const { system, user } = config.cacheAlign
            ? buildOptimizedPrompt(staticPrefix, compressedContext, concisePrompt)
            : {
                system: '',
                user: compressedContext ? `### Compressed Context\n${compressedContext}\n\n### Query\n${concisePrompt}` : concisePrompt
            };

        // Step 5: Detect task type and get structured instructions (only if structuredOutput enabled)
        let taskType = 'code';
        let structuredInstructions = '';
        if (config.structuredOutput) {
            taskType = detectTaskType(concisePrompt);
            structuredInstructions = buildStructuredInstructions(taskType as any);
        }

        // Step 6: Get relevant context from previous turns (only if contextTracking enabled)
        const relevantContext = config.contextTracking ? this.tracker.getRelevantContext(concisePrompt) : '';

        // Step 7: Build final system message
        let finalSystem = system;
        if (structuredInstructions) {
            finalSystem += (finalSystem ? '\n\n' : '') + structuredInstructions;
        }
        if (relevantContext) {
            finalSystem += (finalSystem ? '\n\n' : '') + relevantContext;
        }

        // Step 8: Select model and send request
        const model = await this._selectModel(request);
        if (!model) {
            stream.markdown('No language model available. Please ensure Copilot is enabled and a model is selected.');
            return;
        }

        const messageText = finalSystem ? finalSystem + '\n\n' + user : user;
        const messages = [vscode.LanguageModelChatMessage.User(messageText)];

        try {
            const fullAnswer = await this._sendWithToolLoop(model, messages, request, stream, token);

            // Step 10: Track Q&A (only if contextTracking enabled)
            if (config.contextTracking && fullAnswer) {
                this.tracker.addQA(concisePrompt, fullAnswer);
            }

            // Step 11: Report compression stats
            if (totalOriginalLines > 0 || contentCompressions.length > 0) {
                const savings = totalOriginalLines > 0 ? Math.round((1 - totalCompressedLines / totalOriginalLines) * 100) : 0;
                let statsLine = `\n\n---\n*📊 Token optimization: ${fileCount} file(s) compressed ${totalOriginalLines} → ${totalCompressedLines} lines (${savings}% reduction). Task type: ${taskType}.*`;

                if (contentCompressions.length > 0) {
                    const typeDetails = contentCompressions
                        .map(c => `${c.type} compression: ${c.original} → ${c.compressed} lines`)
                        .join(', ');
                    statsLine += `\n*📊 ${typeDetails}*`;
                }

                stream.markdown(statsLine);

                if (this.onStats) {
                    this.onStats({
                        originalLines: totalOriginalLines,
                        compressedLines: totalCompressedLines,
                        fileCount,
                        taskType
                    });
                }
            } else {
                stream.markdown(`\n\n---\n*📊 Optimized prompt (task: ${taskType}). Concise rewrite: "${concisePrompt}"*`);

                if (this.onStats) {
                    this.onStats({
                        originalLines: 0,
                        compressedLines: 0,
                        fileCount: 0,
                        taskType
                    });
                }
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            stream.markdown(`\n\nError calling language model: ${message}`);
        }
    }

    /**
     * Send a request to the model with full tool-call loop support.
     * Handles multiple rounds of tool calls until the model produces a final text response.
     * This makes @optimize work in ask, agent, plan, and custom modes.
     */
    private async _sendWithToolLoop(
        model: vscode.LanguageModelChat,
        messages: vscode.LanguageModelChatMessage[],
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<string> {
        // Get available tools from VS Code
        const availableTools = vscode.lm.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema
        }));

        const options: vscode.LanguageModelChatRequestOptions = {
            tools: availableTools.length > 0 ? availableTools : undefined
        };

        let fullAnswer = '';
        let loopCount = 0;
        const MAX_LOOPS = 15; // safety limit

        while (loopCount < MAX_LOOPS) {
            loopCount++;
            const response = await model.sendRequest(messages, options, token);

            const toolCalls: vscode.LanguageModelToolCallPart[] = [];
            let hasText = false;

            // Process response stream
            for await (const part of response.stream) {
                if (part instanceof vscode.LanguageModelTextPart) {
                    stream.markdown(part.value);
                    fullAnswer += part.value;
                    hasText = true;
                } else if (part instanceof vscode.LanguageModelToolCallPart) {
                    toolCalls.push(part);
                }
            }

            // If no tool calls, we're done
            if (toolCalls.length === 0) {
                break;
            }

            // Execute tool calls and collect results
            const toolResults: vscode.LanguageModelToolResultPart[] = [];
            for (const toolCall of toolCalls) {
                try {
                    const result = await vscode.lm.invokeTool(
                        toolCall.name,
                        { input: toolCall.input, toolInvocationToken: request.toolInvocationToken },
                        token
                    );
                    toolResults.push(new vscode.LanguageModelToolResultPart(toolCall.callId, result.content));
                } catch (err: unknown) {
                    const errMsg = err instanceof Error ? err.message : String(err);
                    toolResults.push(new vscode.LanguageModelToolResultPart(toolCall.callId, [
                        new vscode.LanguageModelTextPart(`Error executing tool ${toolCall.name}: ${errMsg}`)
                    ]));
                }
            }

            // Add assistant message with tool calls + user message with results for next iteration
            messages = [
                ...messages,
                vscode.LanguageModelChatMessage.Assistant(toolCalls),
                vscode.LanguageModelChatMessage.User(toolResults)
            ];
        }

        return fullAnswer;
    }

    private async _selectModel(request?: vscode.ChatRequest): Promise<vscode.LanguageModelChat | undefined> {
        // Use the model from the request if available (respects user's model picker selection)
        if (request?.model) {
            return request.model;
        }

        try {
            const models = await vscode.lm.selectChatModels({ family: 'gpt-4o' });
            if (models[0]) { return models[0]; }
        } catch {
            // fallback
        }
        try {
            const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
            if (models[0]) { return models[0]; }
        } catch {
            // fallback
        }
        try {
            const models = await vscode.lm.selectChatModels();
            if (models[0]) { return models[0]; }
        } catch {
            // no models
        }
        return undefined;
    }
}
