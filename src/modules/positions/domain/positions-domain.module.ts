import { Module } from '@nestjs/common';
import { PositionsRepositoryModule } from '../repositories/positions-repository.module';
import { PositionDomain } from './position.domain';

@Module({
    imports: [PositionsRepositoryModule],
    providers: [PositionDomain],
    exports: [PositionDomain]
})
export class PositionsDomainModule {}
