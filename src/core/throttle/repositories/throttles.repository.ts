import { Injectable } from '@nestjs/common';
import { Kysely, RawBuilder, Selectable, sql } from 'kysely';
import { DatabaseClient } from '../../database/database.client';
import { DB, Throttles } from '../../database/generated/database.types';
import { GlobalRepository } from '../../database/repositories/global.repository';
import { IdUtil } from '../../../shared/utils/id.util';

export type Throttle = Selectable<Throttles>;

@Injectable()
export class ThrottlesRepository extends GlobalRepository<'Throttles'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Throttles');
    }

    public async registerAttempt(key: string, windowSeconds: number): Promise<number> {
        const executor: Kysely<DB> = this.database.executor;
        const expired: RawBuilder<boolean> = sql<boolean>`"Throttles"."windowStartedAt" + make_interval(secs => ${windowSeconds}) < now()`;
        const rows: readonly { readonly count: number }[] = await executor
            .insertInto('Throttles')
            .values({ id: IdUtil.newId(), key, windowStartedAt: sql`now()`, count: 1 })
            .onConflict((conflict) =>
                conflict.column('key').doUpdateSet({
                    count: sql`CASE WHEN ${expired} THEN 1 ELSE "Throttles"."count" + 1 END`,
                    windowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE "Throttles"."windowStartedAt" END`,
                    updatedAt: sql`now()`
                })
            )
            .returning('count')
            .execute();
        return rows[0]?.count ?? 0;
    }
}
