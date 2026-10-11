import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
    CONNECTION_STATUSES,
    CREDENTIAL_STATUSES,
    ITEM_OUTCOMES,
    MAX_ITEM_IDS_PER_REQUEST,
    SYNC_TRIGGERS
} from '../domain/bank-connections.types';

const CLIENT_SECRET_MIN_LENGTH: number = 16;
const CLIENT_SECRET_MAX_LENGTH: number = 256;
const PRINTABLE_WITHOUT_SPACE: RegExp = /^[\x21-\x7E]+$/;

const itemIdSchema = z.string().trim().toLowerCase().uuid().describe('Item ID copied from the Pluggy demo, as an UUID. Case is ignored');

export const saveCredentialsSchema = z.object({
    clientId: z.string().trim().uuid().describe('Client ID of the Pluggy application, as an UUID'),
    clientSecret: z
        .string()
        .trim()
        .min(CLIENT_SECRET_MIN_LENGTH)
        .max(CLIENT_SECRET_MAX_LENGTH)
        .regex(PRINTABLE_WITHOUT_SPACE)
        .describe('Client Secret of the Pluggy application, 16 to 256 printable characters without spaces. Never returned by any route')
});

export type SaveCredentialsBody = z.infer<typeof saveCredentialsSchema>;

export const connectItemsSchema = z.object({
    itemIds: z
        .array(itemIdSchema)
        .min(1)
        .max(MAX_ITEM_IDS_PER_REQUEST)
        .transform((ids: string[]): string[] => [...new Set<string>(ids)])
        .describe('Item IDs to connect, 1 to 10. Repeated ids are collapsed after trimming and lowercasing')
});

export type ConnectItemsBody = z.infer<typeof connectItemsSchema>;

export const purgeQuerySchema = z.object({
    purgeTransactions: z
        .enum(['true', 'false'])
        .default('false')
        .describe(
            '`true` also soft deletes the accounts that came from the connection and their transactions. Default `false` keeps the history'
        )
});

export class PurgeQueryDto extends createZodDto(purgeQuerySchema) {}

export const connectionIdParamsSchema = z.object({
    id: z.string().uuid().describe('Bank connection id')
});

export class ConnectionIdParamsDto extends createZodDto(connectionIdParamsSchema) {}

export const credentialsViewSchema = z.object({
    configured: z.boolean().describe('Whether the company has Pluggy credentials saved'),
    clientIdHint: z
        .string()
        .nullable()
        .describe('First and last 4 characters of the Client ID. The secret and the full Client ID are never returned'),
    status: z
        .nativeEnum(CREDENTIAL_STATUSES)
        .nullable()
        .describe('`valid` after a successful test, `invalid` after Pluggy rejected the credentials'),
    lastVerifiedAt: z.string().datetime().nullable().describe('When the credentials last passed a test'),
    updatedAt: z.string().datetime().nullable().describe('When the credentials were last saved or changed')
});

const linkedAccountSchema = z.object({
    accountId: z.string().uuid().describe('Financial account id'),
    name: z.string().describe('Account name'),
    kind: z.string().describe('Account kind: checking, savings, credit_card or other'),
    numberLast4: z.string().nullable().describe('Last 4 digits of the account number')
});

const lastRunSchema = z.object({
    trigger: z.string().describe('What started the run: initial, daily, manual or credentials_rotated'),
    status: z.string().describe('running, succeeded, partial or failed'),
    startedAt: z.string().datetime().describe('Start of the run'),
    finishedAt: z.string().datetime().nullable().describe('End of the run, null while running'),
    inserted: z.number().int().describe('Transactions inserted by the run'),
    failureCode: z.string().nullable().describe('Neutral failure code when the run did not succeed')
});

export const connectionViewSchema = z.object({
    id: z.string().uuid().describe('Bank connection id'),
    itemIdHint: z.string().describe('First and last 4 characters of the Item ID'),
    connectorName: z.string().nullable().describe('Name of the bank connector'),
    institutionLogoUrl: z
        .string()
        .max(500)
        .startsWith('https://')
        .nullable()
        .describe('HTTPS URL of the bank logo returned by Pluggy; null when unknown, the client falls back to initials'),
    status: z
        .enum([CONNECTION_STATUSES.active, CONNECTION_STATUSES.needsAttention, CONNECTION_STATUSES.revoked, CONNECTION_STATUSES.paused])
        .describe('Connection status'),
    statusReason: z
        .string()
        .nullable()
        .describe('Why the status is not active: login_error, outdated, waiting_user_input, item_not_found or credentials_invalid'),
    consentExpiresAt: z.string().datetime().nullable().describe('When the bank consent expires'),
    lastSyncAt: z.string().datetime().nullable().describe('Last synchronization attempt'),
    lastSuccessAt: z.string().datetime().nullable().describe('Last successful synchronization'),
    syncing: z.boolean().describe('Whether a synchronization is running'),
    accounts: z.array(linkedAccountSchema).describe('Financial accounts linked to the connection'),
    lastRun: lastRunSchema.nullable().describe('Most recent synchronization run')
});

export const connectionsOverviewSchema = z.object({
    credentials: credentialsViewSchema,
    connections: z.array(connectionViewSchema).describe('Active bank connections, oldest first')
});

export const connectItemsResponseSchema = z.object({
    results: z
        .array(
            z.object({
                itemIdHint: z.string().describe('First and last 4 characters of the Item ID'),
                outcome: z.nativeEnum(ITEM_OUTCOMES).describe('What happened to the Item ID'),
                connection: connectionViewSchema.nullable().describe('The connection, when connected or already connected')
            })
        )
        .describe('One entry per distinct Item ID, in the order sent')
});

export const syncRequestedPayloadSchema = z.object({
    connectionId: z.string().uuid(),
    companyId: z.string().uuid(),
    trigger: z.nativeEnum(SYNC_TRIGGERS)
});

export type SyncRequestedBody = z.infer<typeof syncRequestedPayloadSchema>;

export const syncQueuedSchema = z.object({
    queued: z.literal(true).describe('The synchronization was queued. Poll `GET /spending/connections` while `syncing` is true')
});

export const syncAllQueuedSchema = z.object({
    queued: z.number().int().nonnegative().describe('How many connections were queued. Connections already syncing are left out')
});
