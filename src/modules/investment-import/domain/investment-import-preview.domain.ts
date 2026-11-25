import { Injectable } from '@nestjs/common';
import { InvestmentImportPreviewsRepository } from '../repositories/investment-import-previews.repository';
import { PreviewExpiredError } from './investment-import.errors';
import { InvestmentImportPreview, PREVIEW_TTL_SECONDS, PreviewPayload } from './investment-import.types';
import { ParsedSource } from './investment-statement.types';

export interface NewPreviewInput {
    readonly createdBy: string | null;
    readonly holderUserId: string | null;
    readonly source: ParsedSource;
    readonly fileSha256: string;
    readonly fileName: string;
    readonly payload: PreviewPayload;
}

const MS_PER_SECOND: number = 1000;

@Injectable()
export class InvestmentImportPreviewDomain {
    public constructor(private readonly previews: InvestmentImportPreviewsRepository) {}

    public async create(input: NewPreviewInput, now: Date = new Date()): Promise<InvestmentImportPreview> {
        return this.previews.create({
            createdBy: input.createdBy,
            holderUserId: input.holderUserId,
            source: input.source,
            fileSha256: input.fileSha256,
            fileName: input.fileName,
            payload: JSON.stringify(input.payload),
            expiresAt: new Date(now.getTime() + PREVIEW_TTL_SECONDS * MS_PER_SECOND)
        });
    }

    public async consume(id: string, now: Date = new Date()): Promise<InvestmentImportPreview> {
        const found: InvestmentImportPreview | null = await this.previews.findById(id);
        if (found === null || found.expiresAt.getTime() <= now.getTime() || !(await this.previews.consume(id))) {
            throw new PreviewExpiredError();
        }
        return found;
    }

    public async purgeExpired(now: Date = new Date()): Promise<number> {
        return this.previews.purgeExpired(now);
    }

    public async eraseAll(): Promise<number> {
        return this.previews.eraseAll();
    }
}
