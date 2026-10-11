import { Injectable } from '@nestjs/common';
import { Expression, ExpressionBuilder, OnConflictDatabase, OnConflictTables, RawBuilder, SelectQueryBuilder, SqlBool, sql } from 'kysely';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import {
    ASSET_STATUSES,
    Asset,
    AssetSearchCriteria,
    AssetsDatabase,
    AssetStatus,
    AssetWrite,
    CatalogMarket,
    StatusCount,
    StoredAssetState
} from '../domain/catalog.types';

const UPSERT_CHUNK: number = 500;

const ASSET_COLUMNS: readonly AssetColumn[] = [
    'id',
    'market',
    'externalId',
    'symbol',
    'name',
    'kind',
    'typeGroup',
    'suggestedClassKey',
    'dollarExposure',
    'currency',
    'quotesProvider',
    'quantityDecimals',
    'popularRank',
    'rank',
    'status',
    'sourceHash',
    'seenAt',
    'createdAt',
    'updatedAt'
];

const OVERWRITTEN_COLUMNS: readonly string[] = [
    'symbol',
    'name',
    'kind',
    'typeGroup',
    'suggestedClassKey',
    'dollarExposure',
    'currency',
    'quotesProvider',
    'quantityDecimals',
    'maturityDate',
    'popularRank',
    'rank',
    'sourceHash'
];

type AssetColumn = Exclude<keyof Asset, 'maturityDate'>;

type AssetsQuery = SelectQueryBuilder<AssetsDatabase, 'Assets', Asset>;

function maturityColumn(): RawBuilder<string | null> {
    return sql<string | null>`to_char("Assets"."maturityDate", 'YYYY-MM-DD')`;
}

type ConflictBuilder = ExpressionBuilder<OnConflictDatabase<AssetsDatabase, 'Assets'>, OnConflictTables<'Assets'>>;

function conflictUpdate(eb: ConflictBuilder, seenAt: Date): Record<string, unknown> {
    const hashChanged: Expression<SqlBool> = eb('Assets.sourceHash', 'is distinct from', eb.ref('excluded.sourceHash'));
    const reactivated: Expression<SqlBool> = eb('Assets.status', '<>', ASSET_STATUSES.active);
    return {
        ...Object.fromEntries(OVERWRITTEN_COLUMNS.map((column: string) => [column, eb.ref(`excluded.${column}` as 'excluded.symbol')])),
        status: ASSET_STATUSES.active,
        seenAt,
        updatedAt: eb
            .case()
            .when(eb.or([hashChanged, reactivated]))
            .then(new Date())
            .else(eb.ref('Assets.updatedAt'))
            .end()
    };
}

function chunksOf<T>(items: readonly T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(items.length / size) }, (_unused: unknown, index: number) =>
        items.slice(index * size, (index + 1) * size)
    );
}

@Injectable()
export class AssetsRepository extends BareGlobalRepository<'Assets'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Assets');
    }

    public async findAssetById(id: string): Promise<Asset | null> {
        const rows: Asset[] = await this.selectAssets().where('id', '=', id).limit(1).execute();
        return rows[0] ?? null;
    }

    public async findAssetsByIds(ids: readonly string[]): Promise<Asset[]> {
        if (ids.length === 0) {
            return [];
        }
        return this.selectAssets().where('id', 'in', ids).execute();
    }

    public async findAssetByMarketAndExternalId(market: CatalogMarket, externalId: string): Promise<Asset | null> {
        const rows: Asset[] = await this.selectAssets()
            .where('market', '=', market)
            .where('externalId', '=', externalId)
            .limit(1)
            .execute();
        return rows[0] ?? null;
    }

    public async search(criteria: AssetSearchCriteria): Promise<Asset[]> {
        const base: AssetsQuery = this.selectAssets().where('status', '=', 'active');
        const grouped: AssetsQuery = criteria.group === undefined ? base : base.where('typeGroup', '=', criteria.group);
        if (criteria.text === '') {
            return grouped
                .where('popularRank', 'is not', null)
                .orderBy('popularRank', 'asc')
                .orderBy('symbol', 'asc')
                .limit(criteria.limit)
                .execute();
        }
        return this.textSearch(grouped, criteria).limit(criteria.limit).execute();
    }

    public async loadStates(market: CatalogMarket): Promise<StoredAssetState[]> {
        const rows: { externalId: string; sourceHash: string | null; status: string }[] = await this.db
            .selectFrom('Assets')
            .select(['externalId', 'sourceHash', 'status'])
            .where('market', '=', market)
            .execute();
        return rows.map((row): StoredAssetState => ({ ...row, status: row.status as AssetStatus }));
    }

    public async upsertAll(rows: readonly AssetWrite[], seenAt: Date): Promise<void> {
        for (const chunk of chunksOf(rows, UPSERT_CHUNK)) {
            await this.db
                .insertInto('Assets')
                .values(chunk.map((row: AssetWrite) => ({ id: IdUtil.newId(), ...row, seenAt, status: ASSET_STATUSES.active })))
                .onConflict((conflict) =>
                    conflict.columns(['market', 'externalId']).doUpdateSet((eb: ConflictBuilder) => conflictUpdate(eb, seenAt))
                )
                .execute();
        }
    }

    public async delistUnseen(market: CatalogMarket, seenBefore: Date): Promise<number> {
        const rows: unknown[] = await this.updateManyRows(
            { market, status: ASSET_STATUSES.active, seenAt: { '<': seenBefore } },
            { status: ASSET_STATUSES.delisted, updatedAt: new Date() }
        );
        return rows.length;
    }

    public async countByStatus(market: CatalogMarket): Promise<StatusCount[]> {
        const rows: { status: string; total: string }[] = await this.db
            .selectFrom('Assets')
            .select(['status', sql<string>`count(*)`.as('total')])
            .where('market', '=', market)
            .groupBy('status')
            .execute();
        return rows.map((row): StatusCount => ({ status: row.status as AssetStatus, total: Number(row.total) }));
    }

    private textSearch(query: AssetsQuery, criteria: AssetSearchCriteria): AssetsQuery {
        const symbol: Expression<string> = sql<string>`lower("Assets"."symbol")`;
        const name: Expression<string> = sql<string>`lower("Assets"."name")`;
        const prefix: string = `${criteria.likeText}%`;
        const contains: string = `%${criteria.likeText}%`;
        return query
            .where((eb) => eb.or([eb(symbol, 'like', prefix), eb(name, 'like', contains), sql<boolean>`${name} % ${criteria.text}`]))
            .orderBy(sql`case when ${symbol} = ${criteria.text} then 0 when ${symbol} like ${prefix} then 1 else 2 end`)
            .orderBy(sql`similarity(${name}, ${criteria.text}) desc`)
            .orderBy(sql`"Assets"."rank" asc nulls last`)
            .orderBy(sql`"Assets"."popularRank" asc nulls last`)
            .orderBy('symbol', 'asc');
    }

    private selectAssets(): AssetsQuery {
        return this.db.selectFrom('Assets').select([...ASSET_COLUMNS, maturityColumn().as('maturityDate')]);
    }
}
