import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

const DEFAULT_OUTPUT: string = 'openapi.json';

function loadEnv(): void {
    for (const file of ['.env', '.env.example']) {
        try {
            loadEnvFile(file);
            return;
        } catch {
            void 0;
        }
    }
}

async function dump(): Promise<void> {
    loadEnv();
    const output: string = resolve(process.argv[2] ?? DEFAULT_OUTPUT);
    const app: INestApplication = await NestFactory.create(AppModule, { logger: false, rawBody: true });
    try {
        const document: ReturnType<typeof buildOpenApiDocument> = buildOpenApiDocument(app);
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
        console.log(`openapi: ${String(Object.keys(document.paths).length)} paths em ${output}`);
    } finally {
        await app.close();
    }
}

dump().then(
    () => process.exit(0),
    (error: unknown) => {
        console.error('openapi:dump falhou: a aplicação não montou', error);
        process.exit(1);
    }
);
