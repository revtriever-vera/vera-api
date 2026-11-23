import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AccountExportFailedError } from '../domain/identity.errors';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from './account-spreadsheet-exporter.port';

@Injectable()
export class AccountSpreadsheetRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async sheets(): Promise<SpreadsheetSheet[]> {
        const sheets: SpreadsheetSheet[] = [];
        for (const exporter of this.exporters()) {
            sheets.push(...(await this.sheetsOf(exporter)));
        }
        return sheets;
    }

    private async sheetsOf(exporter: AccountSpreadsheetExporterPort): Promise<readonly SpreadsheetSheet[]> {
        try {
            return await exporter.sheets();
        } catch (error: unknown) {
            throw new AccountExportFailedError(exporter.name, error);
        }
    }

    private exporters(): AccountSpreadsheetExporterPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is AccountSpreadsheetExporterPort => instance instanceof AccountSpreadsheetExporterPort)
            .sort((left: AccountSpreadsheetExporterPort, right: AccountSpreadsheetExporterPort): number =>
                left.name.localeCompare(right.name)
            );
    }
}
