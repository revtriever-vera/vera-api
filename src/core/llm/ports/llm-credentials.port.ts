import { LlmCredentials } from '../llm.types';

export abstract class LlmCredentialsPort {
    public abstract resolve(): Promise<LlmCredentials | null>;
}
