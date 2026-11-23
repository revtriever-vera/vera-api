import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { WEBHOOK_EVENT_STATUSES, WebhookEvent, WebhookEventStatus } from '../domain/whatsapp.types';

@Injectable()
export class WhatsAppWebhookEventsRepository extends BareGlobalRepository<'WhatsAppWebhookEvents'> {
    public constructor(database: DatabaseClient) {
        super(database, 'WhatsAppWebhookEvents');
    }

    public async insertIfAbsent(bodySha256: string, rawBody: string, signatureHeader: string | null): Promise<WebhookEvent | null> {
        const inserted: WebhookEvent | undefined = await this.insertBuilder()
            .values({ id: IdUtil.newId(), bodySha256, rawBody, signatureHeader })
            .onConflict((conflict) => conflict.column('bodySha256').doNothing())
            .returningAll()
            .executeTakeFirst();
        return inserted ?? null;
    }

    public async findBySha(bodySha256: string): Promise<WebhookEvent | null> {
        return this.findOne({ bodySha256 });
    }

    public async finish(id: string, status: WebhookEventStatus, channelKey: string | null): Promise<boolean> {
        const rows: WebhookEvent[] = await this.updateManyRows(
            { id, status: WEBHOOK_EVENT_STATUSES.received },
            { status, channelKey, processedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async lastReceivedAt(): Promise<Date | null> {
        const row: { last: Date | null } | undefined = await this.selectSkipConstraint()
            .select((eb) => eb.fn.max('receivedAt').as('last'))
            .executeTakeFirst();
        return row?.last ?? null;
    }

    public async purgeFinishedBefore(cutoff: Date, batch: number): Promise<number> {
        return this.hardDeleteBefore('receivedAt', cutoff, batch, {
            status: [WEBHOOK_EVENT_STATUSES.processed, WEBHOOK_EVENT_STATUSES.rejected]
        });
    }
}
