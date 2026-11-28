import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppContext } from '../../../core/context/app-context.port';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { QueuePublisherPort } from '../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES } from '../../../shared/constants/queues.constants';
import {
    CredentialsMissingError,
    InvalidPluggyCredentialsError,
    PluggyProviderUnavailableError,
    WebhookUnauthorizedError
} from '../domain/bank-connections.errors';
import {
    CONNECT_TOKEN_TTL_SECONDS,
    ConnectTokenView,
    ItemCreatedPayload,
    ItemResultView,
    PLUGGY_ITEM_CREATED_EVENT,
    SYNC_ATTEMPTS,
    SYNC_BACKOFF_MS
} from '../domain/bank-connections.types';
import { PluggyConnectToken, PluggyCredentialsPlain, PluggySession } from '../drivers/pluggy-session';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyClientPort, PluggyConnectTokenRequest } from '../ports/pluggy-client.port';
import { BankConnectionsLogService, WebhookOutcome } from '../services/bank-connections-log.service';
import { CredentialsVaultService } from '../services/credentials-vault.service';
import { ItemRegistrationService } from '../services/item-registration.service';
import { PluggyAuthenticatorService } from '../services/pluggy-authenticator.service';
import { PluggyWebhookUrlService } from '../services/pluggy-webhook-url.service';
import { itemCreatedPayloadSchema, PluggyWebhookEvent, pluggyWebhookEventSchema } from '../validation/bank-connections.schemas';

const MILLISECONDS: number = 1000;
const REJECTED_CODE: string = 'invalid_credentials';

function isUnusableCredentials(error: unknown): boolean {
    return error instanceof CredentialsMissingError || error instanceof InvalidPluggyCredentialsError;
}

function itemCreatedOf(event: PluggyWebhookEvent, companyId: string): ItemCreatedPayload | null {
    if (event.event !== PLUGGY_ITEM_CREATED_EVENT || event.itemId === undefined) {
        return null;
    }
    if (event.clientUserId !== undefined && event.clientUserId.toLowerCase() !== companyId) {
        return null;
    }
    return { itemId: event.itemId, clientId: event.clientId?.toLowerCase() ?? null, eventId: event.eventId ?? null };
}

@Injectable()
export class PluggyConnectApplication {
    public constructor(
        private readonly authenticator: PluggyAuthenticatorService,
        private readonly vault: CredentialsVaultService,
        private readonly client: PluggyClientPort,
        private readonly registrar: ItemRegistrationService,
        private readonly webhookUrls: PluggyWebhookUrlService,
        private readonly publisher: QueuePublisherPort,
        private readonly context: AppContext,
        private readonly logs: BankConnectionsLogService
    ) {}

    public async connectToken(): Promise<ConnectTokenView> {
        const session: PluggySession = await this.authenticator.authenticateStored(false);
        const companyId: string = this.companyId();
        const webhookUrl: string | null = this.webhookUrls.urlFor(companyId);
        const token: PluggyConnectToken = await this.issue(session, { clientUserId: companyId, webhookUrl });
        return {
            accessToken: token.reveal(),
            expiresAt: new Date(Date.now() + CONNECT_TOKEN_TTL_SECONDS * MILLISECONDS).toISOString(),
            webhookEnabled: webhookUrl !== null
        };
    }

    public async connectResult(itemIds: readonly string[]): Promise<{ results: ItemResultView[] }> {
        const session: PluggySession = await this.authenticator.authenticateStored(false);
        return { results: await this.registrar.register(session, itemIds) };
    }

    public async receiveWebhook(token: string, body: unknown): Promise<void> {
        const companyId: string | null = this.webhookUrls.companyOf(token);
        if (companyId === null) {
            this.logs.webhook(null, 'rejected');
            throw new WebhookUnauthorizedError();
        }
        const parsed: z.SafeParseReturnType<unknown, PluggyWebhookEvent> = pluggyWebhookEventSchema.safeParse(body);
        const payload: ItemCreatedPayload | null = parsed.success ? itemCreatedOf(parsed.data, companyId) : null;
        if (payload === null) {
            this.logs.webhook(parsed.success ? parsed.data.event : null, 'ignored');
            return;
        }
        await this.enqueue(companyId, payload);
        this.logs.webhook(PLUGGY_ITEM_CREATED_EVENT, 'queued');
    }

    public async registerNotified(payload: unknown): Promise<WebhookOutcome> {
        const parsed: z.SafeParseReturnType<unknown, ItemCreatedPayload> = itemCreatedPayloadSchema.safeParse(payload);
        if (!parsed.success) {
            return this.settle('ignored');
        }
        const credentials: PluggyCredentialsPlain | null = await this.usableCredentials();
        if (credentials === null) {
            return this.settle('credentials_unusable');
        }
        if (parsed.data.clientId !== null && parsed.data.clientId !== credentials.clientIdValue.toLowerCase()) {
            return this.settle('client_mismatch');
        }
        const session: PluggySession | null = await this.sessionOf(credentials);
        if (session === null) {
            return this.settle('credentials_unusable');
        }
        const [result] = await this.registrar.register(session, [parsed.data.itemId]);
        return this.settle(result?.outcome ?? 'failed');
    }

    public async simulateItemCreated(itemId: string): Promise<void> {
        const companyId: string = this.companyId();
        const credentials: PluggyCredentialsPlain = await this.vault.openStored();
        await this.receiveWebhook(this.webhookUrls.tokenFor(companyId), {
            event: PLUGGY_ITEM_CREATED_EVENT,
            eventId: randomUUID(),
            clientId: credentials.clientIdValue,
            itemId,
            triggeredBy: 'USER',
            clientUserId: companyId
        });
    }

    @AsCompany()
    private async enqueue(companyId: string, payload: ItemCreatedPayload): Promise<void> {
        await this.publisher.publish(QUEUES.bankConnections, MESSAGE_TYPES.bankConnectionsPluggyItemCreated, payload, {
            jobId: `pluggy-item-created-${companyId}-${payload.itemId}`,
            attempts: SYNC_ATTEMPTS,
            backoffDelayMs: SYNC_BACKOFF_MS
        });
    }

    private async issue(session: PluggySession, request: PluggyConnectTokenRequest): Promise<PluggyConnectToken> {
        try {
            return await this.client.createConnectToken(session, request);
        } catch (error: unknown) {
            if (error instanceof PluggyAuthRejectedError) {
                throw new InvalidPluggyCredentialsError();
            }
            if (error instanceof PluggyUnavailableError) {
                throw new PluggyProviderUnavailableError(error.retryAfterSeconds);
            }
            throw error;
        }
    }

    private async usableCredentials(): Promise<PluggyCredentialsPlain | null> {
        try {
            return await this.vault.openForCurrentCompany();
        } catch (error: unknown) {
            if (isUnusableCredentials(error)) {
                return null;
            }
            throw error;
        }
    }

    private async sessionOf(credentials: PluggyCredentialsPlain): Promise<PluggySession | null> {
        try {
            return await this.authenticator.authenticate(credentials);
        } catch (error: unknown) {
            if (!(error instanceof InvalidPluggyCredentialsError)) {
                throw error;
            }
            await this.vault.markInvalid(REJECTED_CODE);
            return null;
        }
    }

    private settle(outcome: WebhookOutcome): WebhookOutcome {
        this.logs.webhook(PLUGGY_ITEM_CREATED_EVENT, outcome);
        return outcome;
    }

    private companyId(): string {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('BankConnections');
        }
        return companyId;
    }
}
