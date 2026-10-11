import { Module } from '@nestjs/common';
import { PositionsHttpModule } from './access/http/positions-http.module';

@Module({
    imports: [PositionsHttpModule]
})
export class PositionsModule {}
