import { z } from 'zod';

const entry = z.object({
    promptVersion: z.string(),
    reasoning: z.string(),
    judgeAverage: z.number(),
    averageLatencyMs: z.number(),
    costBrlPerRun: z.number()
});

export const baselineSchema = z.object({ updatedAt: z.string(), model: z.string(), tasks: z.record(z.string(), entry) });
