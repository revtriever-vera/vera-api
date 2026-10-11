import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { StatementImportApplicationModule } from '../../application/statement-import-application.module';
import { ImportsController } from './imports.controller';

@Module({
    imports: [StatementImportApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [ImportsController]
})
export class StatementImportHttpModule {}
