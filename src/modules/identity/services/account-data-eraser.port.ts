export abstract class AccountDataEraserPort {
    public abstract readonly area: string;
    public abstract eraseAll(companyId: string): Promise<number>;
}
