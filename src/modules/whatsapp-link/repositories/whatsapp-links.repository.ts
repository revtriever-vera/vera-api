import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import {
    LIVE_STATUSES,
    LINK_STATUSES,
    LinkStatus,
    NewWhatsAppLink,
    StaleLinkRef,
    StatusCount,
    UnlinkReason,
    WhatsAppLink
} from '../domain/whatsapp-link.types';

@Injectable()
export class WhatsAppLinksRepository extends TenantRepository<'WhatsAppLinks'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'WhatsAppLinks');
    }

    public async insertActive(values: Omit<NewWhatsAppLink, 'companyId'>): Promise<WhatsAppLink | null> {
        const row: WhatsAppLink | undefined = await this.insertBuilder()
            .values({ ...values, companyId: this.companyId })
            .onConflict((conflict) => conflict.doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async findLiveOfUser(userId: string): Promise<WhatsAppLink | null> {
        return this.findOne({ userId, status: [...LIVE_STATUSES] });
    }

    public async findLatestOfUser(userId: string): Promise<WhatsAppLink | null> {
        const rows: WhatsAppLink[] = await this.findMany({ userId }, { limit: 1, orderBy: [{ property: 'createdAt', direction: 'desc' }] });
        return rows[0] ?? null;
    }

    public async listLive(): Promise<WhatsAppLink[]> {
        return this.findMany({ status: [...LIVE_STATUSES] });
    }

    public async listAll(offset: number, limit: number): Promise<WhatsAppLink[]> {
        return this.findMany({}, { limit, offset, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async markUnlinked(id: string, reason: UnlinkReason): Promise<boolean> {
        const rows: WhatsAppLink[] = await this.updateManyRows(
            { id, status: [...LIVE_STATUSES] },
            { status: LINK_STATUSES.unlinked, unlinkedAt: new Date(), unlinkReason: reason, updatedAt: new Date() }
        );
        return rows.length > 0;
    }

    public async setStatus(id: string, from: LinkStatus, to: LinkStatus): Promise<boolean> {
        const rows: WhatsAppLink[] = await this.updateManyRows({ id, status: from }, { status: to, updatedAt: new Date() });
        return rows.length > 0;
    }

    public async suspendActive(): Promise<number> {
        const rows: WhatsAppLink[] = await this.updateManyRows(
            { status: LINK_STATUSES.active },
            { status: LINK_STATUSES.suspended, updatedAt: new Date() }
        );
        return rows.length;
    }

    public async touchInbound(id: string, at: Date): Promise<void> {
        await this.updateManyRows({ id }, { lastInboundAt: at, updatedAt: new Date() });
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.hardDeleteWhere({}, batch);
    }

    public async findLiveByPhoneHashAcrossTenants(phoneHash: string): Promise<WhatsAppLink | null> {
        const row: WhatsAppLink | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('phoneHash', '=', phoneHash)
            .where('status', 'in', [...LIVE_STATUSES])
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return row ?? null;
    }

    public async findStaleAcrossTenants(cutoff: Date, batch: number): Promise<StaleLinkRef[]> {
        return this.selectSkipConstraint()
            .select(['id', 'companyId'])
            .where('status', '=', LINK_STATUSES.active)
            .where('deletedAt', 'is', null)
            .where((eb) =>
                eb.or([eb('lastInboundAt', '<', cutoff), eb.and([eb('lastInboundAt', 'is', null), eb('linkedAt', '<', cutoff)])])
            )
            .limit(batch)
            .execute();
    }

    public async countByStatusAcrossTenants(): Promise<StatusCount[]> {
        const rows: { status: string; total: string | number | bigint }[] = await this.selectSkipConstraint()
            .select(['status', (builder) => builder.fn.countAll().as('total')])
            .where('deletedAt', 'is', null)
            .groupBy('status')
            .execute();
        return rows.map((row: { status: string; total: string | number | bigint }): StatusCount => ({
            status: row.status,
            total: Number(row.total)
        }));
    }
}
