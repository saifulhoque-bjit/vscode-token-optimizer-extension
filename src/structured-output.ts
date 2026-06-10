export type TaskType = 'code' | 'analysis' | 'comparison' | 'debug' | 'explain' | 'generate' | 'review';

export function detectTaskType(prompt: string): TaskType {
    const lower = prompt.toLowerCase();

    if (/\b(review|check|audit|lint)\b/.test(lower)) {return 'review';}
    if (/\b(debug|error|bug|fix|issue|crash|exception|traceback)\b/.test(lower)) {return 'debug';}
    if (/\b(compare|vs|versus|difference|pros.?cons)\b/.test(lower)) {return 'comparison';}
    if (/\b(explain|what is|how does|why|describe)\b/.test(lower)) {return 'explain';}
    if (/\b(generate|create|write|build|implement|scaffold)\b/.test(lower)) {return 'generate';}
    if (/\b(analyze|analyse|complexity|performance|metric)\b/.test(lower)) {return 'analysis';}

    return 'code';
}

export function buildStructuredInstructions(taskType: TaskType): string {
    switch (taskType) {
        case 'code':
            return 'Respond with: {file, line, issue, severity, fix}';
        case 'analysis':
            return 'Respond with: {purpose, params, returns, complexity}';
        case 'comparison':
            return 'Respond with a table: | Aspect | Option A | Option B | Recommendation |';
        case 'debug':
            return 'Respond with: {issue, root_cause, fix, prevention}';
        case 'explain':
            return 'Respond with: What (1-2 sentences), Why (purpose), How (mechanism)';
        case 'generate':
            return 'Respond with clean code. Minimal comments. Short functions.';
        case 'review':
            return 'Respond with: {issues: [{file, line, severity, description, fix}], summary}';
    }
}
