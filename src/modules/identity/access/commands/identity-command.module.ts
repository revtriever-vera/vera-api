import { Module } from '@nestjs/common';
import { IdentityApplicationModule } from '../../application/identity-application.module';
import { MembersCleanupCommand, MembersCleanupTickHandler } from './members-cleanup.command';

@Module({
    imports: [IdentityApplicationModule],
    providers: [MembersCleanupCommand, MembersCleanupTickHandler]
})
export class IdentityCommandModule {}
