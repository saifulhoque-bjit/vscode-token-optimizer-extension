import * as vscode from 'vscode';
import { ContextTracker } from './context-tracker';
import { OptimizationPipeline } from './pipeline';

const tracker = new ContextTracker();

export function activate(context: vscode.ExtensionContext): void {
    // Register the @optimize chat participant
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> => {
        const pipeline = new OptimizationPipeline(tracker);
        await pipeline.process(request, chatContext, stream, token);
        return {};
    };

    const participant = vscode.chat.createChatParticipant('optimize', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
    context.subscriptions.push(participant);

    // Register the clear context command
    context.subscriptions.push(
        vscode.commands.registerCommand('optimize.clearContext', () => {
            tracker.clear();
            vscode.window.showInformationMessage('Optimization context cleared.');
        })
    );
}

export function deactivate(): void {
    tracker.clear();
}
