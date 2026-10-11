import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { v7 as uuidV7 } from 'uuid';
import { AsCompany, ContextHolder } from '../context/as-company.decorator';
import { ResealableSecretsPort, SealedRecord } from './resealable-secrets.port';
import { sealedDriverOf } from './sealed-envelope';
import { SealContext, SecretSealerPort } from './secret-sealer.port';

export interface ResealSummary {
    readonly resealed: number;
    readonly skipped: number;
}

function sumOf(summaries: readonly ResealSummary[]): ResealSummary {
    return {
        resealed: summaries.reduce((total: number, summary: ResealSummary): number => total + summary.resealed, 0),
        skipped: summaries.reduce((total: number, summary: ResealSummary): number => total + summary.skipped, 0)
    };
}

@Injectable()
export class SecretResealService {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly sealer: SecretSealerPort
    ) {}

    public async run(): Promise<ResealSummary> {
        return ContextHolder.get().run({ requestId: uuidV7(), locale: 'en' }, async () => this.resealAll());
    }

    private async resealAll(): Promise<ResealSummary> {
        const totals: ResealSummary[] = [];
        for (const port of this.findPorts()) {
            totals.push(await this.resealPort(port));
        }
        return sumOf(totals);
    }

    private async resealPort(port: ResealableSecretsPort): Promise<ResealSummary> {
        const totals: ResealSummary[] = [];
        for (const companyId of await port.listCompanyIds()) {
            totals.push(await this.resealCompany(companyId, port));
        }
        return sumOf(totals);
    }

    @AsCompany()
    public async resealCompany(companyId: string, port: ResealableSecretsPort): Promise<ResealSummary> {
        let resealed: number = 0;
        let skipped: number = 0;
        for (const record of await port.listSealed(companyId)) {
            if (await this.resealRecord(companyId, port, record)) {
                resealed += 1;
                continue;
            }
            skipped += 1;
        }
        return { resealed, skipped };
    }

    private async resealRecord(companyId: string, port: ResealableSecretsPort, record: SealedRecord): Promise<boolean> {
        if (sealedDriverOf(record.sealed) === this.sealer.driver) {
            return false;
        }
        const context: SealContext = { companyId, purpose: port.purpose };
        const plain: string = await this.sealer.open(record.sealed, context);
        await port.replaceSealed(companyId, record.id, await this.sealer.seal(plain, context));
        return true;
    }

    private findPorts(): ResealableSecretsPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper) => wrapper.instance as unknown)
            .filter((instance: unknown): instance is ResealableSecretsPort => instance instanceof ResealableSecretsPort);
    }
}
