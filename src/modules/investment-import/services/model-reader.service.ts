import { Injectable } from '@nestjs/common';
import { assumedOperationsOf } from '../domain/foreign/foreign-summary';
import { AppContext } from '../../../core/context/app-context.port';
import { LLM_TASK_CATALOG } from '../../../core/llm/catalog/llm-task.catalog';
import { LlmTaskSpec } from '../../../core/llm/catalog/llm-task.types';
import { LlmInvalidResponseError, LlmProviderDisabledError } from '../../../core/llm/llm.errors';
import { LlmPort } from '../../../core/llm/llm.port';
import { LLM_TASKS, LlmGenerationResponse } from '../../../core/llm/llm.types';
import { LlmAvailabilityService } from '../../../core/llm/services/llm-availability.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { ModelConfirmationRequiredError, ModelUnavailableError, ModelUnreadableError } from '../domain/investment-import.errors';
import { MODEL_READS_PER_HOUR, ONE_HOUR_SECONDS } from '../domain/investment-import.types';
import { ParsedInvestmentStatement } from '../domain/investment-statement.types';
import { modelFileKindOf } from '../domain/model/file-kind';
import { ModelFileKind } from '../domain/model/model-file.types';
import { collectAnswers, ModelAnswers, ModelDocument, modelDocumentOf, ModelPrompts, ModelRequest } from '../domain/model/model-requests';
import { specsOfModelAnswers, statementOfModelAnswers } from '../domain/model/model-statement';
import { maskStatementText } from '../domain/model/statement-masking';
import {
    INVESTMENT_EXTRACT_IMAGE_INTRO,
    INVESTMENT_EXTRACT_SYSTEM_PROMPT,
    INVESTMENT_EXTRACT_TEXT_INTRO
} from '../domain/prompts/investment-extract.prompt';
import { InvestmentImportLogService } from './investment-import-log.service';
import { NoteAssetResolverService } from './note-asset-resolver.service';

const THROTTLE_KEY: string = 'investment-import-model';

const INVESTMENT_PROMPTS: ModelPrompts = {
    textIntro: INVESTMENT_EXTRACT_TEXT_INTRO,
    imageIntro: INVESTMENT_EXTRACT_IMAGE_INTRO,
    maskText: maskStatementText
};

function specOf(): LlmTaskSpec {
    const spec: LlmTaskSpec | undefined = LLM_TASK_CATALOG.find(
        (candidate: LlmTaskSpec): boolean => candidate.task === LLM_TASKS.investmentExtract
    );
    if (spec === undefined) {
        throw new ModelUnavailableError();
    }
    return spec;
}

function isEmptyReading(statement: ParsedInvestmentStatement): boolean {
    const readable: number = statement.operations.length + statement.ignored.length + statement.rejected.length;
    return readable + assumedOperationsOf(statement).length === 0;
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
        const document: ModelDocument = await modelDocumentOf(bytes, kind, INVESTMENT_PROMPTS);
        const answers: ModelAnswers = await collectAnswers(document.requests, specOf().maxCostMicros, async (request: ModelRequest) =>
            this.generate(request)
        );
        const statement: ParsedInvestmentStatement = await this.statementOf(answers, kind, bytes.byteLength);
        this.report(answers, statement, kind, bytes.byteLength);
        return statement;
    }

    private report(answers: ModelAnswers, statement: ParsedInvestmentStatement, kind: ModelFileKind, sizeBytes: number): void {
        this.logs.modelRead({
            kind,
            sizeBytes,
            calls: answers.texts.length,
            pagesNotRead: answers.unread.length,
            costMicros: answers.costMicros,
            operations: statement.operations.length,
            rejected: statement.rejected.length,
            documentType: statement.documentType ?? null
        });
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

    private async statementOf(answers: ModelAnswers, kind: ModelFileKind, sizeBytes: number): Promise<ParsedInvestmentStatement> {
        const statement: ParsedInvestmentStatement = statementOfModelAnswers(answers.texts, {
            labels: answers.labels,
            unreadPages: answers.unread,
            today: DateUtil.todayInBrazil(),
            tickersBySpec: await this.resolver.resolve(specsOfModelAnswers(answers.texts))
        });
        if (isEmptyReading(statement)) {
            const reason: 'no_operations' | 'positions_without_price' =
                (statement.foreign?.positions.length ?? 0) > 0 ? 'positions_without_price' : 'no_operations';
            this.logs.modelFailed(reason, { kind, sizeBytes });
            throw new ModelUnreadableError(reason);
        }
        return statement;
    }
}
