export abstract class AiDataPurgePort {
    public abstract readonly area: string;
    public abstract purge(): Promise<number>;
}
