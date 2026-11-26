import { z } from 'zod';
import { GOAL_KINDS } from '../domain/goals.types';
import { goalNameSchema, targetDateSchema, targetMinorSchema } from './goals.schemas';

export const goalCreateInputSchema = z
    .object({
        name: goalNameSchema.describe('Name of the goal, as the person said it, up to 60 characters'),
        targetMinor: targetMinorSchema.describe('Amount to reach, in BRL cents (R$ 12,000 is 1200000)'),
        targetMonth: z
            .string()
            .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
            .describe('Month the person wants to reach the amount by, YYYY-MM'),
        kind: z
            .enum([GOAL_KINDS.travel, GOAL_KINDS.homeDownPayment, GOAL_KINDS.other])
            .optional()
            .describe('travel, home_down_payment or other; defaults to other')
    })
    .strict();

export type GoalCreateInput = z.infer<typeof goalCreateInputSchema>;

export const goalProposalPayloadSchema = z.object({
    kind: z.nativeEnum(GOAL_KINDS),
    name: goalNameSchema,
    targetMinor: targetMinorSchema,
    targetDate: targetDateSchema
});

export type GoalProposalPayload = z.infer<typeof goalProposalPayloadSchema>;
