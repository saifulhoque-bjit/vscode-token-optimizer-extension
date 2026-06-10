import * as vscode from 'vscode';

export interface OptimizationConfig {
    enabled: boolean;           // master switch
    compression: boolean;       // code signature extraction
    contentRouter: boolean;     // content-aware routing (diff/log/search/json)
    cacheAlign: boolean;        // static prefix
    conciseRewrite: boolean;    // strip verbose phrases
    structuredOutput: boolean;  // task type → response format
    contextTracking: boolean;   // cross-turn Q&A tracking
}

const CONFIG_SECTION = 'tokenOptimizer';

const DEFAULT_CONFIG: OptimizationConfig = {
    enabled: true,
    compression: true,
    contentRouter: true,
    cacheAlign: true,
    conciseRewrite: true,
    structuredOutput: true,
    contextTracking: true
};

export function getConfig(): OptimizationConfig {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    return {
        enabled: cfg.get<boolean>('enabled', DEFAULT_CONFIG.enabled),
        compression: cfg.get<boolean>('compression', DEFAULT_CONFIG.compression),
        contentRouter: cfg.get<boolean>('contentRouter', DEFAULT_CONFIG.contentRouter),
        cacheAlign: cfg.get<boolean>('cacheAlign', DEFAULT_CONFIG.cacheAlign),
        conciseRewrite: cfg.get<boolean>('conciseRewrite', DEFAULT_CONFIG.conciseRewrite),
        structuredOutput: cfg.get<boolean>('structuredOutput', DEFAULT_CONFIG.structuredOutput),
        contextTracking: cfg.get<boolean>('contextTracking', DEFAULT_CONFIG.contextTracking)
    };
}

export async function updateConfig(key: keyof OptimizationConfig, value: boolean): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
}

export function onConfigChange(callback: (config: OptimizationConfig) => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
            callback(getConfig());
        }
    });
}
