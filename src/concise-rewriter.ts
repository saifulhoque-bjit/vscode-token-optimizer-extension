export function rewriteConcise(prompt: string): string {
    // Don't modify short prompts
    if (prompt.length < 50) {
        return prompt;
    }

    let result = prompt;

    // Remove polite prefixes
    result = result.replace(/^(Can you please help me\s*)/i, '');
    result = result.replace(/^(I would like you to\s*)/i, '');
    result = result.replace(/^(Could you please\s*)/i, '');
    result = result.replace(/^(I'm wondering if\s*)/i, '');
    result = result.replace(/^(I was thinking\s*)/i, '');

    // Remove polite suffixes
    result = result.replace(/\s*(Thank you\.?|Thanks\.?|I appreciate it\.?|I appreciate your help\.?)\s*$/i, '');

    // Replace verbose phrases
    result = result.replace(/\bin order to\b/gi, 'to');
    result = result.replace(/\bat this point in time\b/gi, 'now');
    result = result.replace(/\bfor the purpose of\b/gi, 'for');
    result = result.replace(/\bin the event that\b/gi, 'if');

    // Compress whitespace
    result = result.replace(/\s{2,}/g, ' ').trim();

    return result;
}
