import { Injectable } from '@nestjs/common';
import { GlobalPlan } from '../domain/plans.types';
import { DatabaseClient } from '../../../core/database/database.client';

import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';

@Injectable()
export class GlobalPlansRepository extends BareGlobalRepository<'GlobalPlans'> {
    public constructor(database: DatabaseClient) {
        super(database, 'GlobalPlans');
    }

    public async findByKey(key: string): Promise<GlobalPlan | null> {
        return this.findOne({ key });
    }
}
