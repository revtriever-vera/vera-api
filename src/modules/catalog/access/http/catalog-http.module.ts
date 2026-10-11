import { Module } from '@nestjs/common';
import { ContextModule } from '../../../../core/context/context.module';
import { ThrottleModule } from '../../../../core/throttle/throttle.module';
import { IdentityApplicationModule } from '../../../identity/application/identity-application.module';
import { CatalogApplicationModule } from '../../application/catalog-application.module';
import { CatalogController } from './catalog.controller';

@Module({
    imports: [CatalogApplicationModule, IdentityApplicationModule, ThrottleModule, ContextModule],
    controllers: [CatalogController]
})
export class CatalogHttpModule {}
