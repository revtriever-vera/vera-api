import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';

@Injectable()
export class GlobalPlanCapabilitiesRepository extends BareGlobalRepository<'GlobalPlanCapabilities'> {
    public constructor(database: DatabaseClient) {
        super(database, 'GlobalPlanCapabilities');
    }

    public async capabilitiesOf(planId: string): Promise<string[]> {
        const rows: { capability: string }[] = await this.findMany({ planId });
        return rows.map((row: { capability: string }): string => row.capability);
    }
}
