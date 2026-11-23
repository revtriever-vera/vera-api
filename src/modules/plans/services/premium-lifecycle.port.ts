export abstract class PremiumLifecyclePort {
    public abstract readonly name: string;
    public abstract onPremiumEnded(): Promise<void>;
}
