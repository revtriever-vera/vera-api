export abstract class UsageContextPort {
    public abstract capMicros(): Promise<number | null>;
    public abstract timezone(): Promise<string>;
}
