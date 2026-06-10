export function buildStaticPrefix(): string {
    return `You are an expert code assistant. Analyze code for correctness, performance, and readability. Provide structured, concise answers. When reviewing code, focus on bugs, security issues, and performance problems.`;
}

export function buildOptimizedPrompt(
    staticPrefix: string,
    compressedContext: string,
    userQuery: string
): { system: string; user: string } {
    let userMessage = userQuery;
    if (compressedContext) {
        userMessage = `### Compressed Context\n${compressedContext}\n\n### Query\n${userQuery}`;
    }

    return {
        system: staticPrefix,
        user: userMessage
    };
}
