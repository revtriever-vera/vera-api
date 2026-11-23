const DEFAULT_MAX_USD: number = 1.5;

export const CLI_OPTIONS = {
    task: { type: 'string', default: 'all' },
    mode: { type: 'string', default: 'mock' },
    judge: { type: 'boolean', default: false },
    reps: { type: 'string', default: '1' },
    'base-url': { type: 'string' },
    model: { type: 'string' },
    reasoning: { type: 'string' },
    'max-usd': { type: 'string', default: String(DEFAULT_MAX_USD) },
    'update-baseline': { type: 'boolean', default: false }
} as const;
