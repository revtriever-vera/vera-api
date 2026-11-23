import { LlmGenerationRequest, LlmGenerationResponse } from './llm.types';

export abstract class LlmPort {
    public abstract generate(request: LlmGenerationRequest): Promise<LlmGenerationResponse>;
}
