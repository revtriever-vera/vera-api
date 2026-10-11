export abstract class CryptoPort {
    public abstract encrypt(plain: string): string;
    public abstract decrypt(cipher: string): string;
}
