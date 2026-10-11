import { DatabaseClient } from './database.client';

export class TransactionalContext {
    private static client: DatabaseClient | null = null;

    public static set(client: DatabaseClient): void {
        TransactionalContext.client = client;
    }

    public static get(): DatabaseClient {
        if (!TransactionalContext.client) {
            throw new Error('TransactionalContext not initialized — is DatabaseModule imported?');
        }
        return TransactionalContext.client;
    }
}

export function UsingTransaction(): MethodDecorator {
    return (_target: object, _key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor => {
        const original: (...args: unknown[]) => Promise<unknown> = descriptor.value as (...args: unknown[]) => Promise<unknown>;
        descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
            return TransactionalContext.get().withTransaction(async () => original.apply(this, args));
        };
        return descriptor;
    };
}
