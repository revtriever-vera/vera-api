import { Module } from '@nestjs/common';
import { ContextModule } from '../../../core/context/context.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { PositionsRepository } from './positions.repository';

@Module({
    imports: [DatabaseModule, ContextModule],
    providers: [PositionsRepository],
    exports: [PositionsRepository]
})
export class PositionsRepositoryModule {}
