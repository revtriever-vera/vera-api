import { Module } from '@nestjs/common';
import { ConcentrationHttpModule } from './access/http/concentration-http.module';

@Module({
    imports: [ConcentrationHttpModule]
})
export class ConcentrationModule {}
