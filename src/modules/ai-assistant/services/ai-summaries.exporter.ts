import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { AiSummaryDomain } from '../domain/ai-summary.domain';
import { storedParagraphsSchema } from '../domain/summary-output.schemas';
import { AiSummary, SummaryExport } from '../domain/summary.types';

export const AI_SUMMARIES_EXPORT_AREA: string = 'ai_summaries';

@Injectable()
export class AiSummariesExporter extends AccountDataExporterPort {
    public readonly area: string = AI_SUMMARIES_EXPORT_AREA;

    public constructor(private readonly summaries: AiSummaryDomain) {
        super();
    }

    public async exportAll(): Promise<SummaryExport[]> {
        const rows: AiSummary[] = await this.summaries.listAll();
        return rows.map((row: AiSummary): SummaryExport => ({
            kind: row.kind,
            period: row.periodKey,
            locale: row.locale,
            source: row.source,
            generatedAt: row.generatedAt.toISOString(),
            paragraphs: storedParagraphsSchema.parse(row.paragraphs)
        }));
    }
}
