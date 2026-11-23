import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AppContext } from '../src/core/context/app-context.port';
import { PlatformSeedOutcome, PlatformTotpResetOutcome } from '../src/modules/identity/domain/identity.types';
import { PlatformSeedService } from '../src/modules/identity/services/platform-seed.service';

const EMAIL_VARIABLE: string = 'PLATFORM_ADMIN_EMAIL';
const RESET_VARIABLE: string = 'PLATFORM_RESET_TOTP';

function loadEnv(): void {
    try {
        loadEnvFile();
    } catch {
        void 0;
    }
}

function requiredEmail(): string {
    const email: string = (process.env[EMAIL_VARIABLE] ?? '').trim();
    if (email === '') {
        throw new Error(`${EMAIL_VARIABLE} é obrigatório: o e-mail do admin nunca fica no repositório`);
    }
    return email;
}

function wantsReset(): boolean {
    return process.argv.includes('--reset-totp') || process.env[RESET_VARIABLE] === 'true';
}

async function run(app: INestApplicationContext, email: string): Promise<string> {
    const context: AppContext = app.get(AppContext, { strict: false });
    const service: PlatformSeedService = app.get(PlatformSeedService, { strict: false });
    return context.run({ requestId: 'platform-seed', locale: 'pt-BR' }, async () => {
        if (wantsReset()) {
            const reset: PlatformTotpResetOutcome = await service.resetTotp(email);
            return reset === 'reset' ? 'autenticador zerado e sessões revogadas' : 'o usuário não é da company de sistema: nada a fazer';
        }
        const outcome: PlatformSeedOutcome = await service.seed(email);
        return outcome === 'created' ? 'admin criado na company de sistema' : 'o usuário já existe: nada a fazer';
    });
}

async function seed(): Promise<void> {
    loadEnv();
    if (process.env['DEPLOYMENT_MODE'] === 'self_hosted') {
        throw new Error('a company de sistema não existe em DEPLOYMENT_MODE=self_hosted');
    }
    const email: string = requiredEmail();
    const app: INestApplicationContext = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    try {
        console.log(await run(app, email));
    } finally {
        await app.close();
    }
}

seed().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
