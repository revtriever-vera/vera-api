import { Injectable } from '@nestjs/common';
import { StatementImportPreviewsRepository } from '../repositories/statement-import-previews.repository';
import { modelPreviewPayloadSchema } from '../validation/model-preview-payload.schema';
import { PreviewExpiredError } from './statement-import.errors';
import { MODEL_PREVIEW_TTL_SECONDS, ModelReading, StatementImportPreview } from './statement-import.types';

const MS_PER_SECOND: number = 1000;

export interface NewModelPreview {
    readonly createdBy: string | null;
    readonly fileSha256: string;
    readonly fileName: string;
    readonly reading: ModelReading;
}

export interface OpenModelPreview {
    readonly preview: StatementImportPreview;
    readonly reading: ModelReading;
}

function isOpen(preview: StatementImportPreview, now: Date): boolean {
    return preview.expiresAt.getTime() > now.getTime();
}

function openOf(preview: StatementImportPreview): OpenModelPreview {
    return { preview, reading: modelPreviewPayloadSchema.parse(preview.payload) };
}

@Injectable()
export class StatementImportPreviewDomain {
    public constructor(private readonly previews: StatementImportPreviewsRepository) {}

    public async create(input: NewModelPreview, now: Date = new Date()): Promise<OpenModelPreview> {
        const preview: StatementImportPreview = await this.previews.create({
            createdBy: input.createdBy,
            fileSha256: input.fileSha256,
            fileName: input.fileName,
            payload: JSON.stringify(input.reading),
            expiresAt: new Date(now.getTime() + MODEL_PREVIEW_TTL_SECONDS * MS_PER_SECOND)
        });
        return { preview, reading: input.reading };
    }

    public async findOpenByHash(fileSha256: string, now: Date = new Date()): Promise<OpenModelPreview | null> {
        const found: StatementImportPreview | undefined = (await this.previews.findByHash(fileSha256)).find(
            (preview: StatementImportPreview): boolean => isOpen(preview, now)
        );
        return found === undefined ? null : openOf(found);
    }

    public async requireOpen(id: string, now: Date = new Date()): Promise<OpenModelPreview> {
        const found: StatementImportPreview | null = await this.previews.findById(id);
        if (found === null || !isOpen(found, now)) {
            throw new PreviewExpiredError();
        }
        return openOf(found);
    }

    public async consume(id: string): Promise<void> {
        if (!(await this.previews.consume(id))) {
            throw new PreviewExpiredError();
        }
    }

    public async removeExpired(id: string, now: Date = new Date()): Promise<number> {
        return this.previews.removeExpired(id, now);
    }
}
