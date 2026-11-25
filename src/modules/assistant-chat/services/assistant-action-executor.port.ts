import { JsonObject } from '../../../core/llm/llm.types';

export interface ActionChoice {
    readonly transactionId?: string;
    readonly version?: string;
}

export interface ActionCandidate {
    readonly id: string;
    readonly version: string;
    readonly date: string;
    readonly description: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly accountName: string;
}

export abstract class AssistantActionExecutorPort {
    public abstract readonly tool: string;
    public abstract stateOf(payload: JsonObject): Promise<string>;
    public abstract execute(payload: JsonObject, choice: ActionChoice | null): Promise<string>;

    public candidates(_payload: JsonObject): Promise<readonly ActionCandidate[]> {
        return Promise.resolve([]);
    }
}
