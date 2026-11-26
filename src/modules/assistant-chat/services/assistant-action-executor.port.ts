import { JsonObject } from '../../../core/llm/llm.types';

export interface ActionChoice {
    readonly transactionId?: string;
    readonly version?: string;
    readonly edits?: readonly Record<string, unknown>[];
    readonly fixedIncome?: readonly Record<string, unknown>[];
}

export interface ActionOutcome {
    readonly text: string;
    readonly reference: string | null;
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
    public abstract execute(payload: JsonObject, choice: ActionChoice | null): Promise<ActionOutcome>;

    public candidates(_payload: JsonObject): Promise<readonly ActionCandidate[]> {
        return Promise.resolve([]);
    }

    public preview(_payload: JsonObject): Promise<JsonObject | null> {
        return Promise.resolve(null);
    }
}
