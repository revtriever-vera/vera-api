import { AppContext } from './app-context.port';

export class ContextHolder {
    private static context: AppContext | null = null;

    public static set(context: AppContext): void {
        ContextHolder.context = context;
    }

    public static get(): AppContext {
        if (!ContextHolder.context) {
            throw new Error('ContextHolder not initialized — is ContextModule imported?');
        }
        return ContextHolder.context;
    }
}

export function AsCompany(): MethodDecorator {
    return (_target: object, _key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor => {
        const original: (...args: unknown[]) => Promise<unknown> = descriptor.value as (...args: unknown[]) => Promise<unknown>;
        descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
            const companyId: unknown = args[0];
            if (typeof companyId !== 'string') {
                throw new Error('@AsCompany requires companyId as the first method parameter');
            }
            const context: AppContext = ContextHolder.get();
            return context.run({ ...context.get(), companyId }, async () => original.apply(this, args));
        };
        return descriptor;
    };
}
