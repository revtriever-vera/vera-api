import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ContextModule } from '../context/context.module';
import { ObservabilityModule } from '../observability/observability.module';
import { DatabaseClient } from './database.client';
import { databaseConfig } from './config/database.config';
import { KyselyDatabaseClient } from './kysely-database.client';
import { TransactionalContext } from './using-transaction.decorator';

@Module({
    imports: [ConfigModule.forFeature(databaseConfig), ContextModule, ObservabilityModule],
    providers: [{ provide: DatabaseClient, useClass: KyselyDatabaseClient }],
    exports: [DatabaseClient]
})
export class DatabaseModule implements OnModuleInit {
    public constructor(private readonly client: DatabaseClient) {}

    public onModuleInit(): void {
        TransactionalContext.set(this.client);
    }
}
