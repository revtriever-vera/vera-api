import { Injectable } from '@nestjs/common';
import { InvestmentImportsRepository } from '../repositories/investment-imports.repository';
import { Page } from '../../../shared/pagination/pagination.types';
import { cleanFileName } from './operation-fingerprint';
import { InvestmentImport, NewImportInput, PositionSnapshotEntry } from './investment-operations.types';

@Injectable()
export class InvestmentImportDomain {
    public constructor(private readonly imports: InvestmentImportsRepository) {}

    public async create(input: NewImportInput): Promise<InvestmentImport> {
        return this.imports.create({
            createdBy: input.createdBy,
            source: input.source,
            fileSha256: input.fileSha256,
            fileName: cleanFileName(input.fileName),
            noteNumbers: [...input.noteNumbers]
        });
    }

    public async findById(id: string): Promise<InvestmentImport | null> {
        return this.imports.findById(id);
    }

    public async page(page: number, pageSize: number): Promise<Page<InvestmentImport>> {
        return this.imports.page(page, pageSize);
    }

    public async findCompletedByHash(fileSha256: string): Promise<InvestmentImport | null> {
        return this.imports.findCompletedByHash(fileSha256);
    }

    public async listAll(): Promise<InvestmentImport[]> {
        return this.imports.listAll();
    }

    public async saveSnapshots(
        id: string,
        before: readonly PositionSnapshotEntry[],
        after: readonly PositionSnapshotEntry[]
    ): Promise<void> {
        await this.imports.saveSnapshots(id, {
            positionsBefore: JSON.stringify(before),
            positionsAfter: JSON.stringify(after)
        });
    }

    public async markUndone(id: string): Promise<void> {
        await this.imports.markUndone(id);
    }
}
