import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CatalogSyncApplication } from '../src/modules/catalog/application/catalog-sync.application';

async function seed(): Promise<void> {
    try {
        loadEnvFile();
    } catch {
        void 0;
    }
    process.env['CATALOG_DRIVER'] = 'mock';
    const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    await app.get(CatalogSyncApplication, { strict: false }).syncAllNow();
    await app.close();
    console.log('catálogo de exemplo carregado');
}

seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
