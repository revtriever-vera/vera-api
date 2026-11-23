import { Module } from '@nestjs/common';
import { IssuersHttpModule } from './access/http/issuers-http.module';

@Module({
    imports: [IssuersHttpModule]
})
export class IssuersModule {}
