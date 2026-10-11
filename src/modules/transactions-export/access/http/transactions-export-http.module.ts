import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { TransactionsExportApplicationModule } from '../../application/transactions-export-application.module';
import { TransactionsExportController } from './transactions-export.controller';

@Module({
    imports: [TransactionsExportApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [TransactionsExportController]
})
export class TransactionsExportHttpModule {}
