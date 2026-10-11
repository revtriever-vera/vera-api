import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AccountErasureFailedError, AccountExportFailedError } from '../domain/identity.errors';
import { ErasedArea } from '../domain/identity.types';
import { AccountDataEraserPort } from './account-data-eraser.port';
import { AccountDataExporterPort } from './account-data-exporter.port';
import { IdentityLogService } from './identity-log.service';

@Injectable()
export class AccountDataRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly logs: IdentityLogService
    ) {}

    public exportAreas(): string[] {
        return this.exporters().map((exporter: AccountDataExporterPort): string => exporter.area);
    }

    public async exportSections(companyId: string): Promise<Record<string, unknown>> {
        const sections: Record<string, unknown> = {};
        for (const exporter of this.exporters()) {
            sections[exporter.area] = await this.exportOne(exporter, companyId);
        }
        return sections;
    }

    public async eraseAll(companyId: string): Promise<ErasedArea[]> {
        const erased: ErasedArea[] = [];
        for (const eraser of this.erasers()) {
            erased.push(await this.eraseOne(eraser, companyId));
        }
        return erased;
    }

    private async exportOne(exporter: AccountDataExporterPort, companyId: string): Promise<unknown> {
        try {
            return await exporter.exportAll(companyId);
        } catch (error: unknown) {
            throw new AccountExportFailedError(exporter.area, error);
        }
    }

    private async eraseOne(eraser: AccountDataEraserPort, companyId: string): Promise<ErasedArea> {
        try {
            const erased: number = await eraser.eraseAll(companyId);
            this.logs.erasureAreaDone(eraser.area, erased);
            return { area: eraser.area, erased };
        } catch (error: unknown) {
            this.logs.erasureAreaFailed(eraser.area, error);
            throw new AccountErasureFailedError(eraser.area, error);
        }
    }

    private exporters(): AccountDataExporterPort[] {
        return this.instances().filter(
            (instance: unknown): instance is AccountDataExporterPort => instance instanceof AccountDataExporterPort
        );
    }

    private erasers(): AccountDataEraserPort[] {
        return this.instances().filter((instance: unknown): instance is AccountDataEraserPort => instance instanceof AccountDataEraserPort);
    }

    private instances(): unknown[] {
        return this.discovery.getProviders().map((wrapper: InstanceWrapper): unknown => wrapper.instance);
    }
}
