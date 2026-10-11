export abstract class AccountDataExporterPort {
    public abstract readonly area: string;
    public abstract exportAll(companyId: string): Promise<unknown>;
}
