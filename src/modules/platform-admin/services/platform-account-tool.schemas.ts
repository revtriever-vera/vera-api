import { z } from 'zod';
import { ACCESS_LAYERS, accessRequestSchema, AccessLayer, accountsQuerySchema } from '../validation/platform-accounts.schemas';
import { auditQuerySchema } from '../validation/platform-audit.schemas';

export const listAccountsToolShape = accountsQuerySchema.shape;

export const getAccountToolShape = {
    accountId: z.string().uuid().describe('Account id'),
    reason: accessRequestSchema.shape.reason
};

export const listAuditToolShape = auditQuerySchema.shape;

export const SUMMARY_LAYERS: AccessLayer[] = [ACCESS_LAYERS.summary];
