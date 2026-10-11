import { v7 as uuidV7, validate as uuidValidate } from 'uuid';

export class IdUtil {
    public static newId(): string {
        return uuidV7();
    }

    public static isId(value: string): boolean {
        return uuidValidate(value);
    }
}
