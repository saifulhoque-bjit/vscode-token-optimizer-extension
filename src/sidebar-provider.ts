import * as vscode from 'vscode';
import { getConfig, updateConfig, onConfigChange, OptimizationConfig } from './config-manager';

export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'tokenOptimizer.sidebar';
    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtml();

        // Listen for messages from webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'toggleSetting':
                        await updateConfig(message.key, message.value);
                        break;
                    case 'requestConfig':
                        this._sendConfig();
                        break;
                }
            },
            null,
            this._disposables
        );

        // Listen for config changes from VS Code settings
        const configListener = onConfigChange((config) => {
            this._sendConfig();
            this._updateMasterState(config);
        });
        this._disposables.push(configListener);

        // Send initial config
        this._sendConfig();

        // Clean up when view is disposed
        webviewView.onDidDispose(() => {
            this._disposables.forEach(d => d.dispose());
            this._disposables = [];
        });
    }

    public updateStats(originalLines: number, compressedLines: number, fileCount: number, taskType: string): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateStats',
                stats: { originalLines, compressedLines, fileCount, taskType }
            });
        }
    }

    private _sendConfig(): void {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateConfig',
                config: getConfig()
            });
        }
    }

    private _updateMasterState(config: OptimizationConfig): void {
        // Update activity bar icon color based on state
        // (VS Code handles this via context keys if needed)
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Token Optimizer</title>
    <style>
        :root {
            --bg: var(--vscode-sideBar-background, #1e1e1e);
            --fg: var(--vscode-sideBar-foreground, #cccccc);
            --fg-muted: var(--vscode-descriptionForeground, #999999);
            --border: var(--vscode-input-border, #3c3c3c);
            --green: var(--vscode-charts-green, #4ec9b0);
            --red: var(--vscode-charts-red, #f44747);
            --toggle-bg: #3c3c3c;
            --toggle-bg-on: var(--vscode-charts-green, #4ec9b0);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family, system-ui, -apple-system, sans-serif);
            font-size: var(--vscode-font-size, 13px);
            color: var(--fg);
            background: var(--bg);
            padding: 0;
            overflow-x: hidden;
        }

        .container {
            padding: 8px 12px;
        }

        .master-section {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid var(--border);
            margin-bottom: 8px;
        }

        .master-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 14px;
        }

        .master-label .icon {
            font-size: 16px;
        }

        .master-status {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
        }

        .master-status.on {
            background: rgba(78, 201, 176, 0.15);
            color: var(--green);
        }

        .master-status.off {
            background: rgba(244, 71, 71, 0.15);
            color: var(--red);
        }

        .separator {
            height: 1px;
            background: var(--border);
            margin: 8px 0;
        }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--fg-muted);
            padding: 8px 0 4px 0;
        }

        .toggle-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid rgba(60, 60, 60, 0.3);
        }

        .toggle-item:last-child {
            border-bottom: none;
        }

        .toggle-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            flex: 1;
            min-width: 0;
        }

        .toggle-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            cursor: default;
        }

        .toggle-label .emoji {
            font-size: 14px;
            flex-shrink: 0;
        }

        .toggle-desc {
            font-size: 11px;
            color: var(--fg-muted);
            padding-left: 22px;
            line-height: 1.3;
        }

        /* Toggle switch - CSS only */
        .switch {
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
            flex-shrink: 0;
            margin-left: 8px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--toggle-bg);
            transition: background-color 0.2s ease;
            border-radius: 20px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 2px;
            bottom: 2px;
            background-color: #ffffff;
            transition: transform 0.2s ease;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--toggle-bg-on);
        }

        input:checked + .slider:before {
            transform: translateX(16px);
        }

        input:disabled + .slider {
            opacity: 0.5;
            cursor: not-allowed;
        }

        /* Stats section */
        .stats-section {
            margin-top: 12px;
            padding: 10px;
            background: rgba(60, 60, 60, 0.3);
            border-radius: 6px;
            border: 1px solid var(--border);
        }

        .stats-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--fg-muted);
            margin-bottom: 6px;
        }

        .stats-content {
            font-size: 12px;
            color: var(--fg);
            line-height: 1.5;
        }

        .stats-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
        }

        .stats-label {
            color: var(--fg-muted);
        }

        .stats-value {
            font-weight: 500;
        }

        .stats-value.green {
            color: var(--green);
        }

        .no-stats {
            font-size: 12px;
            color: var(--fg-muted);
            font-style: italic;
            text-align: center;
            padding: 4px 0;
        }

        /* Disabled overlay */
        .disabled-overlay {
            opacity: 0.5;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Master Toggle -->
        <div class="master-section">
            <div class="master-label">
                <span class="icon">⚡</span>
                <span>Token Optimizer</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span id="masterStatus" class="master-status on">ON</span>
                <label class="switch">
                    <input type="checkbox" id="masterToggle" checked>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Technique Toggles -->
        <div id="techniquesContainer">
            <div class="section-title">Optimization Techniques</div>

            <div class="toggle-item" data-key="compression">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">🗜️</span>
                        <span>Context Compression</span>
                    </div>
                    <div class="toggle-desc">Extract file signatures instead of full source</div>
                </div>
                <label class="switch" title="Extract file signatures instead of full source">
                    <input type="checkbox" data-key="compression" checked>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="toggle-item" data-key="contentRouter">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">🔀</span>
                        <span>Content-Aware Routing</span>
                    </div>
                    <div class="toggle-desc">Auto-detect and compress diffs, logs, search results, JSON</div>
                </div>
                <label class="switch" title="Auto-detect and compress diffs, logs, search results, JSON">
                    <input type="checkbox" data-key="contentRouter" checked>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="toggle-item" data-key="cacheAlign">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">⚡</span>
                        <span>Cache Alignment</span>
                    </div>
                    <div class="toggle-desc">Static prefix for prompt caching efficiency</div>
                </div>
                <label class="switch" title="Static prefix for prompt caching efficiency">
                    <input type="checkbox" data-key="cacheAlign" checked>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="toggle-item" data-key="conciseRewrite">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">✂️</span>
                        <span>Concise Rewriting</span>
                    </div>
                    <div class="toggle-desc">Strip verbose phrases and polite filler</div>
                </div>
                <label class="switch" title="Strip verbose phrases and polite filler">
                    <input type="checkbox" data-key="conciseRewrite" checked>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="toggle-item" data-key="structuredOutput">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">📊</span>
                        <span>Structured Output</span>
                    </div>
                    <div class="toggle-desc">Task detection → response format instructions</div>
                </div>
                <label class="switch" title="Task detection → response format instructions">
                    <input type="checkbox" data-key="structuredOutput" checked>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="toggle-item" data-key="contextTracking">
                <div class="toggle-info">
                    <div class="toggle-label">
                        <span class="emoji">🔄</span>
                        <span>Context Tracking</span>
                    </div>
                    <div class="toggle-desc">Cross-turn Q&A context for follow-up questions</div>
                </div>
                <label class="switch" title="Cross-turn Q&A context for follow-up questions">
                    <input type="checkbox" data-key="contextTracking" checked>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <!-- Stats Section -->
        <div class="stats-section">
            <div class="stats-title">📊 Compression Stats</div>
            <div id="statsContent">
                <div class="no-stats">No requests processed yet</div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // DOM elements
        const masterToggle = document.getElementById('masterToggle');
        const masterStatus = document.getElementById('masterStatus');
        const techniquesContainer = document.getElementById('techniquesContainer');
        const statsContent = document.getElementById('statsContent');

        // Toggle handlers
        masterToggle.addEventListener('change', () => {
            const enabled = masterToggle.checked;
            vscode.postMessage({ command: 'toggleSetting', key: 'enabled', value: enabled });
            updateMasterUI(enabled);
        });

        // Individual toggle handlers
        document.querySelectorAll('.toggle-item input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const key = e.target.getAttribute('data-key');
                const value = e.target.checked;
                vscode.postMessage({ command: 'toggleSetting', key, value });
            });
        });

        // Update master UI state
        function updateMasterUI(enabled) {
            if (enabled) {
                masterStatus.textContent = 'ON';
                masterStatus.className = 'master-status on';
                techniquesContainer.classList.remove('disabled-overlay');
            } else {
                masterStatus.textContent = 'OFF';
                masterStatus.className = 'master-status off';
                techniquesContainer.classList.add('disabled-overlay');
            }
        }

        // Update individual toggles from config
        function updateToggles(config) {
            masterToggle.checked = config.enabled;
            updateMasterUI(config.enabled);

            Object.keys(config).forEach(key => {
                if (key !== 'enabled') {
                    const checkbox = document.querySelector('input[data-key="' + key + '"]');
                    if (checkbox) {
                        checkbox.checked = config[key];
                    }
                }
            });
        }

        // Update stats display
        function updateStatsDisplay(stats) {
            if (!stats || (stats.originalLines === 0 && stats.fileCount === 0)) {
                statsContent.innerHTML = '<div class="no-stats">No requests processed yet</div>';
                return;
            }

            const reduction = stats.originalLines > 0
                ? Math.round((1 - stats.compressedLines / stats.originalLines) * 100)
                : 0;

            statsContent.innerHTML =
                '<div class="stats-row">' +
                    '<span class="stats-label">Files</span>' +
                    '<span class="stats-value">' + stats.fileCount + '</span>' +
                '</div>' +
                '<div class="stats-row">' +
                    '<span class="stats-label">Lines</span>' +
                    '<span class="stats-value">' + stats.originalLines + ' → ' + stats.compressedLines + '</span>' +
                '</div>' +
                '<div class="stats-row">' +
                    '<span class="stats-label">Reduction</span>' +
                    '<span class="stats-value green">' + reduction + '%</span>' +
                '</div>' +
                '<div class="stats-row">' +
                    '<span class="stats-label">Task type</span>' +
                    '<span class="stats-value">' + stats.taskType + '</span>' +
                '</div>';
        }

        // Message handler
        window.addEventListener('message', (event) => {
            const message = event.data;
            switch (message.command) {
                case 'updateConfig':
                    updateToggles(message.config);
                    break;
                case 'updateStats':
                    updateStatsDisplay(message.stats);
                    break;
            }
        });

        // Request initial config
        vscode.postMessage({ command: 'requestConfig' });
    </script>
</body>
</html>`;
    }
}
