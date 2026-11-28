import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmInvalidResponseError, LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmPort } from '../../../core/llm/llm.port';
import { LLM_TASKS, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { AppError } from '../../../shared/errors/app.error';
import {
    ModelAnswers,
    ModelDocument,
    ModelDocumentService,
    ModelFileKind,
    ModelPrompts,
    ModelRequest
} from '../../investment-import/services/model-document.service';
import { readingOfModelAnswers } from '../domain/model-reading';
import {
    STATEMENT_EXTRACT_IMAGE_INTRO,
    STATEMENT_EXTRACT_SYSTEM_PROMPT,
    STATEMENT_EXTRACT_TEXT_INTRO
} from '../domain/prompts/statement-extract.prompt';
import { ModelConfirmationRequiredError, ModelUnavailableError, ModelUnreadableError } from '../domain/statement-import.errors';
import { MODEL_READS_PER_HOUR, MODEL_UNREADABLE_REASONS, ModelReading, ONE_HOUR_SECONDS } from '../domain/statement-import.types';
import { maskBankStatementText } from '../domain/statement-masking';
import { ModelFileFacts, StatementImportLogService } from './statement-import-log.service';

const THROTTLE_KEY: string = 'statement-import-model';

const STATEMENT_PROMPTS: ModelPrompts = {
    textIntro: STATEMENT_EXTRACT_TEXT_INTRO,
    imageIntro: STATEMENT_EXTRACT_IMAGE_INTRO,
    maskText: maskBankStatementText
};

function capMicros(): number {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find(
        (candidate: LlmTaskSpec): boolean => candidate.task === LLM_TASKS.statementExtract
    );
    if (spec === undefined) {
        throw new ModelUnavailableError();
    }
    return spec.maxCostMicros;
}

function reasonOf(error: unknown): string {
    if (!(error instanceof AppError)) {
        return 'unknown';
    }
    const reason: unknown = error.meta?.['reason'];
    return typeof reason === 'string' ? reason : error.code;
}

@Injectable()
export class StatementModelReaderService {
    public constructor(
        private readonly documents: ModelDocumentService,
        private readonly llm: LlmPort,
        private readonly availability: LlmAvailabilityService,
        private readonly throttle: ThrottleService,
        private readonly context: AppContext,
        private readonly logs: StatementImportLogService
    ) {}

    public accepts(bytes: Uint8Array): boolean {
        return this.documents.kindOf(bytes) !== null;
    }

    public async assertConsented(consent: boolean): Promise<void> {
        if (!(await this.availability.enabled())) {
            throw new ModelUnavailableError();
        }
        if (!consent) {
            throw new ModelConfirmationRequiredError();
        }
    }

    public async read(bytes: Uint8Array): Promise<ModelReading> {
        const kind: ModelFileKind | null = this.documents.kindOf(bytes);
        if (kind === null) {
            throw new ModelUnreadableError(MODEL_UNREADABLE_REASONS.invalidResponse);
        }
        const companyId: string = this.context.get().companyId ?? '';
        await this.throttle.assertAllowed(`${THROTTLE_KEY}:${companyId}`, MODEL_READS_PER_HOUR, ONE_HOUR_SECONDS);
        const document: ModelDocument = await this.documents.documentOf(bytes, kind, STATEMENT_PROMPTS);
        const answers: ModelAnswers = await this.documents.answersOf(document.requests, capMicros(), async (request: ModelRequest) =>
            this.generate(request)
        );
        return this.readingOf(answers, document, bytes.byteLength);
    }

    private readingOf(answers: ModelAnswers, document: ModelDocument, sizeBytes: number): ModelReading {
        const facts: ModelFileFacts = { kind: document.kind, sizeBytes, textLayer: document.hasTextLayer };
        try {
            const reading: ModelReading = readingOfModelAnswers(answers.texts, answers.unread);
            this.logs.modelRead({
                ...facts,
                calls: answers.texts.length,
                pagesNotRead: answers.unread.length,
                costMicros: answers.costMicros,
                rows: reading.rows.length,
                rejected: reading.rejections.length
            });
            return reading;
        } catch (error: unknown) {
            this.logs.modelFailed(reasonOf(error), facts);
            throw error;
        }
    }

    private async generate(request: ModelRequest): Promise<LlmGenerationResponse> {
        try {
            return await this.llm.generate({
                task: LLM_TASKS.statementExtract,
                feature: 'ai',
                system: STATEMENT_EXTRACT_SYSTEM_PROMPT,
                messages: [{ role: 'user', content: request.content }]
            });
        } catch (error: unknown) {
            if (error instanceof LlmProviderDisabledError) {
                throw new ModelUnavailableError();
            }
            if (error instanceof LlmInvalidResponseError) {
                throw new ModelUnreadableError(MODEL_UNREADABLE_REASONS.invalidResponse);
            }
            throw error;
        }
    }
}
