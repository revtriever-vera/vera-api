import { Module } from '@nestjs/common';
import { IssuersServicesModule } from '../services/issuers-services.module';
import { IssuerSearchApplication } from './issuer-search.application';

@Module({
    imports: [IssuersServicesModule],
    providers: [IssuerSearchApplication],
    exports: [IssuerSearchApplication, IssuersServicesModule]
})
export class IssuersApplicationModule {}
