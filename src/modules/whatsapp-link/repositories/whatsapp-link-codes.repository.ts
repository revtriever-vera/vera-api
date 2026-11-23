import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { NewWhatsAppLinkCode, WhatsAppLinkCode } from '../domain/whatsapp-link.types';

@Injectable()
export class WhatsAppLinkCodesRepository extends BareTenantRepository<'WhatsAppLinkCodes'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'WhatsAppLinkCodes');
    }

    public async create(values: Omit<NewWhatsAppLinkCode, 'companyId'>): Promise<WhatsAppLinkCode> {
        return this.createRow({ ...values, companyId: this.companyId });
    }

    public async cancelPendingOfUser(userId: string): Promise<number> {
        const now: Date = new Date();
        const rows: WhatsAppLinkCode[] = await this.updateManyRows(
            { userId, usedAt: null, canceledAt: null },
            { canceledAt: now, updatedAt: now }
        );
        return rows.length;
    }

    public async cancelPendingOfCompany(): Promise<number> {
        const now: Date = new Date();
        const rows: WhatsAppLinkCode[] = await this.updateManyRows({ usedAt: null, canceledAt: null }, { canceledAt: now, updatedAt: now });
        return rows.length;
    }

    public async findPendingOfUser(userId: string, now: Date): Promise<WhatsAppLinkCode | null> {
        return this.findOne({ userId, usedAt: null, canceledAt: null, expiresAt: { '>': now } });
    }

    public async consume(id: string, now: Date): Promise<boolean> {
        const rows: WhatsAppLinkCode[] = await this.updateManyRows(
            { id, usedAt: null, canceledAt: null, expiresAt: { '>': now } },
            { usedAt: now, updatedAt: now }
        );
        return rows.length > 0;
    }

    public async eraseAll(batch: number): Promise<number> {
        return this.hardDeleteWhere({}, batch);
    }

    public async findPendingByCodeHashAcrossTenants(codeHash: string, now: Date): Promise<WhatsAppLinkCode | null> {
        const row: WhatsAppLinkCode | undefined = await this.selectSkipConstraint()
            .selectAll()
            .where('codeHash', '=', codeHash)
            .where('usedAt', 'is', null)
            .where('canceledAt', 'is', null)
            .where('expiresAt', '>', now)
            .executeTakeFirst();
        return row ?? null;
    }
}
