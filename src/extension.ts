import * as vscode from 'vscode';
import { ContextTracker } from './context-tracker';
import { OptimizationPipeline, PipelineStats } from './pipeline';
import { getConfig } from './config-manager';
import { SidebarProvider } from './sidebar-provider';

let tracker = new ContextTracker();

export function activate(context: vscode.ExtensionContext): void {
    // Create sidebar provider
    const sidebarProvider = new SidebarProvider(context.extensionUri);

    // Register the sidebar webview view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SidebarProvider.viewType,
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Stats callback for pipeline → sidebar
    const onStats = (stats: PipelineStats) => {
        sidebarProvider.updateStats(stats.originalLines, stats.compressedLines, stats.fileCount, stats.taskType);
    };

    // Register the @optimize chat participant
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> => {
        const config = getConfig();
        const pipeline = new OptimizationPipeline(tracker, onStats);
        await pipeline.process(request, chatContext, stream, token, config);
        return {};
    };

    const participant = vscode.chat.createChatParticipant('optimize', handler);
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
    context.subscriptions.push(participant);

    // Register toggleAll command
    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.toggleAll', async () => {
            const config = getConfig();
            const { updateConfig } = await import('./config-manager');
            await updateConfig('enabled', !config.enabled);
            vscode.window.showInformationMessage(
                `Token Optimizer ${!config.enabled ? 'enabled' : 'disabled'}.`
            );
        })
    );

    // Register clearContext command
    context.subscriptions.push(
        vscode.commands.registerCommand('tokenOptimizer.clearContext', () => {
            tracker.clear();
            vscode.window.showInformationMessage('Token Optimizer context cleared.');
        })
    );

    // Keep legacy command for backward compatibility
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
