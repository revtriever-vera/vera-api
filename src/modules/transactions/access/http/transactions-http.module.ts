import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { TransactionsApplicationModule } from '../../application/transactions-application.module';
import { AccountsController } from './accounts.controller';
import { TransactionsController } from './transactions.controller';

@Module({
    imports: [TransactionsApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [TransactionsController, AccountsController]
})
export class TransactionsHttpModule {}
