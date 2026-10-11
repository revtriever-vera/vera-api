import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { MarketDataApplicationModule } from '../../application/market-data-application.module';
import { MarketDataController } from './market-data.controller';

@Module({
    imports: [MarketDataApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [MarketDataController]
})
export class MarketDataHttpModule {}
