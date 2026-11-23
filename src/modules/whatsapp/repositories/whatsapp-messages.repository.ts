import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { statusesBefore } from '../domain/message-status';
import { MESSAGE_STATUSES, MessageStatus, NewWhatsAppMessage, StatusUpdate, WhatsAppMessage } from '../domain/whatsapp.types';

const EXPORT_PAGE: number = 500;

@Injectable()
export class WhatsAppMessagesRepository extends BareTenantRepository<'WhatsAppMessages'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'WhatsAppMessages');
    }

    public async create(values: Omit<NewWhatsAppMessage, 'companyId'>): Promise<WhatsAppMessage> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async insertInbound(values: Omit<NewWhatsAppMessage, 'companyId'>): Promise<boolean> {
        const inserted: { id: string } | undefined = await this.insertBuilder()
            .values({ ...values, companyId: this.companyId })
            .onConflict((conflict) => conflict.doNothing())
            .returning('id')
            .executeTakeFirst();
        return inserted !== undefined;
    }

    public async discardInbound(wamid: string): Promise<void> {
        await this.hardDeleteWhere({ externalId: wamid, direction: 'in' }, 1);
    }

    public async claimSending(id: string): Promise<boolean> {
        const rows: WhatsAppMessage[] = await this.updateManyRows(
            { id, status: MESSAGE_STATUSES.queued },
            { status: MESSAGE_STATUSES.sending }
        );
        return rows.length > 0;
    }

    public async releaseSending(id: string): Promise<void> {
        await this.updateManyRows({ id, status: MESSAGE_STATUSES.sending }, { status: MESSAGE_STATUSES.queued });
    }

    public async markSent(id: string, externalId: string): Promise<void> {
        await this.updateManyRows(
            { id, status: MESSAGE_STATUSES.sending },
            { status: MESSAGE_STATUSES.sent, externalId, sentAt: new Date() }
        );
    }

    public async markEnded(id: string, status: 'failed' | 'blocked', errorCode: string): Promise<void> {
        await this.updateManyRows(
            { id, status: [MESSAGE_STATUSES.queued, MESSAGE_STATUSES.sending] },
            { status, errorCode, failedAt: new Date() }
        );
    }

    public async lastInboundAt(peer: string): Promise<Date | null> {
        const row: { last: Date | null } | undefined = await this.selectScoped()
            .select((eb) => eb.fn.max('sentAt').as('last'))
            .where('peer', '=', peer)
            .where('direction', '=', 'in')
            .executeTakeFirst();
        return row?.last ?? null;
    }

    public async clearTextOf(linkId: string, peer: string): Promise<number> {
        const byLink: WhatsAppMessage[] = await this.updateManyRows({ linkId }, { body: null, payload: null, updatedAt: new Date() });
        const byPeer: WhatsAppMessage[] = await this.updateManyRows({ peer }, { body: null, payload: null, updatedAt: new Date() });
        return byLink.length + byPeer.length;
    }

    public async listForExport(offset: number): Promise<WhatsAppMessage[]> {
        return this.findMany({}, { limit: EXPORT_PAGE, offset, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.hardDeleteWhere({}, batch);
    }

    public async advanceStatusAcrossTenants(next: MessageStatus, update: StatusUpdate): Promise<boolean> {
        const stamp: Record<string, Date> = { [`${next}At`]: update.timestamp };
        // eslint-disable-next-line local/repository-escape, no-restricted-syntax -- o status da Meta chega sem tenant: a mensagem é achada pelo wamid, único no mundo
        const updated: { id: string } | undefined = await this.db
            .updateTable('WhatsAppMessages')
            .set({
                status: next,
                ...stamp,
                pricingCategory: update.pricingCategory ?? undefined,
                billable: update.billable ?? undefined,
                errorCode: update.errorCode ?? undefined,
                updatedAt: new Date()
            })
            .where('externalId', '=', update.wamid)
            .where('direction', '=', 'out')
            .where('status', 'in', statusesBefore(next))
            .returning('id')
            .executeTakeFirst();
        return updated !== undefined;
    }

    public async purgeTextBeforeAcrossTenants(cutoff: Date, batch: number): Promise<number> {
        const stale: { id: string }[] = await this.selectSkipConstraint()
            .select('id')
            .where('createdAt', '<', cutoff)
            .where((eb) => eb.or([eb('body', 'is not', null), eb('payload', 'is not', null)]))
            .limit(batch)
            .execute();
        if (stale.length === 0) {
            return 0;
        }
        // eslint-disable-next-line local/repository-escape, no-restricted-syntax -- varredura diária de retenção do texto, em todas as companies
        const result: { numUpdatedRows: bigint } = await this.db
            .updateTable('WhatsAppMessages')
            .set({ body: null, payload: null, updatedAt: new Date() })
            .where(
                'id',
                'in',
                stale.map((row: { id: string }): string => row.id)
            )
            .executeTakeFirstOrThrow();
        return Number(result.numUpdatedRows);
    }
}
