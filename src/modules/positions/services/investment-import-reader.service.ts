import { Injectable } from '@nestjs/common';
import { Page } from '../../../shared/pagination/pagination.types';
import { InvestmentImportDomain } from '../domain/investment-import.domain';
import { InvestmentOperationDomain } from '../domain/investment-operation.domain';
import { ImportSource, ImportStatus, InvestmentImport } from '../domain/investment-operations.types';
import { ImportNotFoundError } from '../domain/positions.errors';

export interface InvestmentImportRecord {
    readonly id: string;
    readonly source: ImportSource;
    readonly fileName: string;
    readonly status: ImportStatus;
    readonly operations: number;
    readonly createdAt: Date;
}

function recordOf(row: InvestmentImport, operations: number): InvestmentImportRecord {
    return {
        id: row.id,
        source: row.source as ImportSource,
        fileName: row.fileName,
        status: row.status as ImportStatus,
        operations,
        createdAt: row.createdAt
    };
}

@Injectable()
export class InvestmentImportReaderService {
    public constructor(
        private readonly imports: InvestmentImportDomain,
        private readonly operations: InvestmentOperationDomain
    ) {}

    public async findCompletedByHash(fileSha256: string): Promise<InvestmentImportRecord | null> {
        const found: InvestmentImport | null = await this.imports.findCompletedByHash(fileSha256);
        return found === null ? null : recordOf(found, 0);
    }

    public async require(id: string): Promise<InvestmentImportRecord> {
        const found: InvestmentImport | null = await this.imports.findById(id);
        if (found === null) {
            throw new ImportNotFoundError(id);
        }
        return recordOf(found, 0);
    }

    public async page(page: number, pageSize: number): Promise<Page<InvestmentImportRecord>> {
        const result: Page<InvestmentImport> = await this.imports.page(page, pageSize);
        const counts: Map<string, number> = await this.operations.countByImports(
            result.data.map((row: InvestmentImport): string => row.id)
        );
        return {
            data: result.data.map((row: InvestmentImport): InvestmentImportRecord => recordOf(row, counts.get(row.id) ?? 0)),
            pagination: result.pagination
        };
    }
}
