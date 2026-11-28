import { Injectable } from '@nestjs/common';
import { LlmGenerationResponse } from '../../../core/llm/llm.types';
import { modelFileKindOf } from '../domain/model/file-kind';
import { ModelFileKind } from '../domain/model/model-file.types';
import { collectAnswers, ModelAnswers, ModelDocument, modelDocumentOf, ModelPrompts, ModelRequest } from '../domain/model/model-requests';

export type { ModelAnswers, ModelDocument, ModelFileKind, ModelPrompts, ModelRequest };

@Injectable()
export class ModelDocumentService {
    public kindOf(bytes: Uint8Array): ModelFileKind | null {
        return modelFileKindOf(bytes);
    }

    public async documentOf(bytes: Uint8Array, kind: ModelFileKind, prompts: ModelPrompts): Promise<ModelDocument> {
        return modelDocumentOf(bytes, kind, prompts);
    }

    public async answersOf(
        requests: readonly ModelRequest[],
        capMicros: number,
        generate: (request: ModelRequest) => Promise<LlmGenerationResponse>
    ): Promise<ModelAnswers> {
        return collectAnswers(requests, capMicros, generate);
    }
}
