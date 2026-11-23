import { Module } from '@nestjs/common';
import { IdentityCommandModule } from './access/commands/identity-command.module';
import { IdentityHttpModule } from './access/identity-http.module';

@Module({
    imports: [IdentityHttpModule, IdentityCommandModule]
})
export class IdentityModule {}
