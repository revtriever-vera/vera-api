import { Injectable } from '@nestjs/common';
import { RawBuilder, Selectable } from 'kysely';
import { DatabaseClient } from '../../database/database.client';
import { Throttles } from '../../database/generated/database.types';
import { GlobalRepository } from '../../database/repositories/global.repository';
import { IdUtil } from '../../../shared/utils/id.util';

export type Throttle = Selectable<Throttles>;

@Injectable()
export class ThrottlesRepository extends GlobalRepository<'Throttles'> {
    public constructor(database: DatabaseClient) {
        super(database, 'Throttles');
    }

    public async registerAttempt(key: string, windowSeconds: number): Promise<number> {
        const expired: RawBuilder<boolean> = this
            .rawSql<boolean>`"Throttles"."windowStartedAt" + make_interval(secs => ${windowSeconds}) < now()`;
        const rows: readonly { readonly count: number }[] = await this.insertBuilder()
            .values({ id: IdUtil.newId(), key, windowStartedAt: this.rawSql`now()`, count: 1 })
            .onConflict((conflict) =>
                conflict.column('key').doUpdateSet({
                    count: this.rawSql`CASE WHEN ${expired} THEN 1 ELSE "Throttles"."count" + 1 END`,
                    windowStartedAt: this.rawSql`CASE WHEN ${expired} THEN now() ELSE "Throttles"."windowStartedAt" END`,
                    updatedAt: this.rawSql`now()`
                })
            )
            .returning('count')
            .execute();
        return rows[0]?.count ?? 0;
    }
}
