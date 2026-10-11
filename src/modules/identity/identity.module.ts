import { Module } from '@nestjs/common';
import { IdentityHttpModule } from './access/identity-http.module';

@Module({
    imports: [IdentityHttpModule]
})
export class IdentityModule {}
