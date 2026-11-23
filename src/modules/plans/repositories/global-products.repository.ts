import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { GlobalProduct } from '../domain/plans.types';

@Injectable()
export class GlobalProductsRepository extends BareGlobalRepository<'GlobalProducts'> {
    public constructor(database: DatabaseClient) {
        super(database, 'GlobalProducts');
    }

    public async findByKey(key: string): Promise<GlobalProduct | null> {
        return this.findOne({ key });
    }
}
