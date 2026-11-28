import { UsagePlan } from '../usage.types';

export abstract class UsageContextPort {
    public abstract plan(): Promise<UsagePlan | null>;
    public abstract capMicros(): Promise<number | null>;
    public abstract helpCapMicros(): Promise<number | null>;
    public abstract timezone(): Promise<string>;
}
