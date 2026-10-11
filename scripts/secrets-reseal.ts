import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ResealSummary, SecretResealService } from '../src/core/crypto/secret-reseal.service';

async function reseal(): Promise<void> {
    try {
        loadEnvFile();
    } catch {
        void 0;
    }
    const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    try {
        const summary: ResealSummary = await app.get(SecretResealService, { strict: false }).run();
        console.log(`segredos: ${String(summary.resealed)} selados de novo, ${String(summary.skipped)} já no driver atual`);
    } finally {
        await app.close();
    }
}

reseal().catch((error: unknown) => {
    console.error(error instanceof Error ? error.name : 'falha ao selar de novo');
    process.exit(1);
});
