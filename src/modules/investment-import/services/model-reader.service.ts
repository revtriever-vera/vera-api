import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmInvalidResponseError, LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmPort } from '../../../core/llm/llm.port';
import { LLM_TASKS, LlmContentBlock, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { DateUtil } from '../../../shared/utils/date.util';
import {
    FileTooManyPagesError,
    ModelConfirmationRequiredError,
    ModelUnavailableError,
    ModelUnreadableError
} from '../domain/investment-import.errors';
import { MODEL_READS_PER_HOUR, ONE_HOUR_SECONDS } from '../domain/investment-import.types';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { modelFileKindOf } from '../domain/model/file-kind';
import { MODEL_FILE_KINDS, ModelFileKind } from '../domain/model/model-file.types';
import { PreparedImage, prepareImage } from '../domain/model/image-prepare';
import { specsOfModelAnswers, statementOfModelAnswers } from '../domain/model/model-statement';
import { maskStatementText } from '../domain/model/statement-masking';
import { MAX_SCANNED_PAGES, PdfContent, readPdfContent, splitPdfPages } from '../domain/pdf-text';
import {
    INVESTMENT_EXTRACT_IMAGE_INTRO,
    INVESTMENT_EXTRACT_SYSTEM_PROMPT,
    INVESTMENT_EXTRACT_TEXT_INTRO
} from '../domain/prompts/investment-extract.prompt';
import { InvestmentImportLogService } from './investment-import-log.service';
import { NoteAssetResolverService } from './note-asset-resolver.service';

const THROTTLE_KEY: string = 'investment-import-model';
const TEXT_PAGE_LABEL: string = 'text';

interface ModelRequest {
    readonly label: string;
    readonly content: readonly LlmContentBlock[];
}

interface Answers {
    readonly texts: string[];
    readonly labels: string[];
    readonly unread: string[];
    readonly costMicros: number;
}

function specOf(): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find(
        (candidate: LlmTaskSpec): boolean => candidate.task === LLM_TASKS.investmentExtract
    );
    if (spec === undefined) {
        throw new ModelUnavailableError();
    }
    return spec;
}

function textRequestOf(content: PdfContent): ModelRequest[] {
    const text: string = content.pages
        .map((page: string, index: number): string => `--- page ${String(index + 1)} ---\n${maskStatementText(page)}`)
        .join('\n');
    return [{ label: TEXT_PAGE_LABEL, content: [{ kind: 'text', text: `${INVESTMENT_EXTRACT_TEXT_INTRO}\n${text}` }] }];
}

async function scannedRequestsOf(bytes: Uint8Array, content: PdfContent): Promise<ModelRequest[]> {
    if (content.pageCount > MAX_SCANNED_PAGES) {
        throw new FileTooManyPagesError(MAX_SCANNED_PAGES);
    }
    const pages: Uint8Array[] = await splitPdfPages(bytes, content.pageCount);
    return pages.map((page: Uint8Array, index: number): ModelRequest => ({
        label: `p${String(index + 1)}`,
        content: [
            { kind: 'text', text: INVESTMENT_EXTRACT_IMAGE_INTRO },
            { kind: 'file', mediaType: 'application/pdf', data: page }
        ]
    }));
}

async function pdfRequestsOf(bytes: Uint8Array): Promise<ModelRequest[]> {
    const content: PdfContent = await readPdfContent(bytes);
    return content.hasTextLayer ? textRequestOf(content) : scannedRequestsOf(bytes, content);
}

async function imageRequestsOf(bytes: Uint8Array, kind: ModelFileKind): Promise<ModelRequest[]> {
    const image: PreparedImage = await prepareImage(bytes, kind);
    return [
        {
            label: 'p1',
            content: [
                { kind: 'text', text: INVESTMENT_EXTRACT_IMAGE_INTRO },
                { kind: 'image', mediaType: image.mediaType, data: image.data }
            ]
        }
    ];
}

@Injectable()
export class ModelReaderService {
    public constructor(
        private readonly llm: LlmPort,
        private readonly availability: LlmAvailabilityService,
        private readonly throttle: ThrottleService,
        private readonly context: AppContext,
        private readonly logs: InvestmentImportLogService,
        private readonly resolver: NoteAssetResolverService
    ) {}

    public accepts(bytes: Uint8Array): boolean {
        return modelFileKindOf(bytes) !== null;
    }

    public async read(bytes: Uint8Array, consent: boolean): Promise<ParsedInvestmentStatement> {
        const kind: ModelFileKind | null = modelFileKindOf(bytes);
        if (kind === null) {
            throw new ModelUnreadableError('invalid_response');
        }
        await this.assertAllowed(consent);
        const requests: ModelRequest[] = kind === MODEL_FILE_KINDS.pdf ? await pdfRequestsOf(bytes) : await imageRequestsOf(bytes, kind);
        const answers: Answers = await this.ask(requests);
        const statement: ParsedInvestmentStatement = await this.statementOf(answers, kind, bytes.byteLength);
        this.logs.modelRead({
            kind,
            sizeBytes: bytes.byteLength,
            calls: answers.texts.length,
            pagesNotRead: answers.unread.length,
            costMicros: answers.costMicros,
            operations: statement.operations.length,
            rejected: statement.rejected.length,
            documentType: statement.documentType ?? null
        });
        return statement;
    }

    private async assertAllowed(consent: boolean): Promise<void> {
        if (!(await this.availability.enabled())) {
            throw new ModelUnavailableError();
        }
        if (!consent) {
            throw new ModelConfirmationRequiredError();
        }
        const companyId: string = this.context.get().companyId ?? '';
        await this.throttle.assertAllowed(`${THROTTLE_KEY}:${companyId}`, MODEL_READS_PER_HOUR, ONE_HOUR_SECONDS);
    }

    private async ask(requests: readonly ModelRequest[]): Promise<Answers> {
        const cap: number = specOf().maxCostMicros;
        const answers: Answers = { texts: [], labels: [], unread: [], costMicros: 0 };
        let costMicros: number = 0;
        for (const request of requests) {
            if (costMicros >= cap) {
                answers.unread.push(request.label);
                continue;
            }
            const response: LlmGenerationResponse = await this.generate(request);
            costMicros += response.costMicros;
            answers.texts.push(response.text);
            answers.labels.push(request.label);
        }
        return { ...answers, costMicros };
    }

    private async generate(request: ModelRequest): Promise<LlmGenerationResponse> {
        try {
            return await this.llm.generate({
                task: LLM_TASKS.investmentExtract,
                feature: 'ai',
                system: INVESTMENT_EXTRACT_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: request.content }]
            });
        } catch (error: unknown) {
            if (error instanceof LlmProviderDisabledError) {
                throw new ModelUnavailableError();
            }
            if (error instanceof LlmInvalidResponseError) {
                throw new ModelUnreadableError('invalid_response');
            }
            throw error;
        }
    }

    private async statementOf(answers: Answers, kind: ModelFileKind, sizeBytes: number): Promise<ParsedInvestmentStatement> {
        const statement: ParsedInvestmentStatement = statementOfModelAnswers(answers.texts, {
            labels: answers.labels,
            unreadPages: answers.unread,
            today: DateUtil.todayInBrazil(),
            tickersBySpec: await this.resolver.resolve(specsOfModelAnswers(answers.texts))
        });
        if (statement.operations.length + statement.ignored.length + statement.rejected.length === 0) {
            this.logs.modelFailed('no_operations', { kind, sizeBytes });
            throw new ModelUnreadableError('no_operations');
        }
        return statement;
    }
}
