import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { NewPendingAction, PENDING_RESOLUTIONS, PendingAction, PendingResolution } from '../domain/whatsapp-chat.types';

@Injectable()
export class WhatsAppPendingActionsRepository extends BareTenantRepository<'WhatsAppPendingActions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'WhatsAppPendingActions');
    }

    public async create(values: Omit<NewPendingAction, 'companyId'>): Promise<PendingAction> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async findOfLink(id: string, linkId: string): Promise<PendingAction | null> {
        return this.findOne({ id, linkId });
    }

    public async findLatestOpen(linkId: string, now: Date): Promise<PendingAction | null> {
        const rows: PendingAction[] = await this.findMany(
            { linkId, resolvedAt: null, expiresAt: { '>': now } },
            { limit: 1, orderBy: [{ property: 'createdAt', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async findLatest(linkId: string): Promise<PendingAction | null> {
        const rows: PendingAction[] = await this.findMany(
            { linkId, resolvedAt: null },
            { limit: 1, orderBy: [{ property: 'createdAt', direction: 'desc' }] }
        );
        return rows[0] ?? null;
    }

    public async resolveOpen(id: string, resolution: PendingResolution, now: Date): Promise<PendingAction | null> {
        const where: { id: string; resolvedAt: null; expiresAt?: { '>': Date } } = { id, resolvedAt: null };
        const rows: PendingAction[] = await this.updateManyRows(
            resolution === PENDING_RESOLUTIONS.expired ? where : { ...where, expiresAt: { '>': now } },
            { resolvedAt: now, resolution, updatedAt: now }
        );
        return rows[0] ?? null;
    }
}
