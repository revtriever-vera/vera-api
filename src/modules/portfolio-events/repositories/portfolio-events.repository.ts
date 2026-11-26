import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'kysely';
import { DatabaseClient } from '../../../core/database/database.client';
import { DB } from '../../../core/database/generated/database.types';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { EventKind, EventSource, EventWindow, PortfolioEventView, PortfolioEventWrite } from '../domain/portfolio-events.types';

const UPSERT_CHUNK: number = 500;
const READ_LIMIT: number = 5000;

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

type StoredEventRead = Omit<PortfolioEventView, 'kind' | 'source'> & { kind: string; source: string };

@Injectable()
export class PortfolioEventsRepository extends BareGlobalRepository<'PortfolioEvents'> {
    public constructor(database: DatabaseClient) {
        super(database, 'PortfolioEvents');
    }

    public async findInWindow(assetIds: readonly string[], window: EventWindow): Promise<PortfolioEventView[]> {
        if (assetIds.length === 0) {
            return [];
        }
        const rows: StoredEventRead[] = await this.readQuery()
            .where('assetId', 'in', assetIds)
            .where(this.rawSql<boolean>`coalesce("exDate", "paymentDate", "eventDate") between ${window.from}::date and ${window.to}::date`)
            .orderBy('assetId', 'asc')
            .orderBy('kind', 'asc')
            .orderBy('externalKey', 'asc')
            .limit(READ_LIMIT)
            .execute();
        return rows.map((row: StoredEventRead): PortfolioEventView => ({
            ...row,
            kind: row.kind as EventKind,
            source: row.source as EventSource
        }));
    }

    private readQuery(): SelectQueryBuilder<Pick<DB, 'PortfolioEvents'>, 'PortfolioEvents', StoredEventRead> {
        return this.selectScoped()
            .select(['id', 'assetId', 'kind', 'source', 'externalKey', 'currency', 'documentUrl'])
            .select([
                this.rawSql<string | null>`to_char("exDate", 'YYYY-MM-DD')`.as('exDate'),
                this.rawSql<string | null>`to_char("paymentDate", 'YYYY-MM-DD')`.as('paymentDate'),
                this.rawSql<string | null>`to_char("eventDate", 'YYYY-MM-DD')`.as('eventDate'),
                this.rawSql<string | null>`"amountPerUnit"::text`.as('amountPerUnit')
            ]);
    }

    public async upsertMany(events: readonly PortfolioEventWrite[]): Promise<void> {
        for (const chunk of chunksOf(events, UPSERT_CHUNK)) {
            await this.upsertChunk(chunk);
        }
    }

    private async upsertChunk(chunk: readonly PortfolioEventWrite[]): Promise<void> {
        await this.insertBuilder()
            .values(chunk.map((event: PortfolioEventWrite) => ({ id: IdUtil.newId(), ...event })))
            .onConflict((conflict) =>
                conflict.columns(['source', 'externalKey']).doUpdateSet((eb) => ({
                    assetId: eb.ref('excluded.assetId'),
                    kind: eb.ref('excluded.kind'),
                    exDate: eb.ref('excluded.exDate'),
                    paymentDate: eb.ref('excluded.paymentDate'),
                    eventDate: eb.ref('excluded.eventDate'),
                    amountPerUnit: eb.ref('excluded.amountPerUnit'),
                    currency: eb.ref('excluded.currency'),
                    documentUrl: eb.ref('excluded.documentUrl'),
                    updatedAt: new Date()
                }))
            )
            .execute();
    }
}
