import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { AppContext, AppContextData } from './app-context.port';
import { MissingContextError } from './context.errors';

@Injectable()
export class AlsAppContext extends AppContext {
    private readonly storage: AsyncLocalStorage<AppContextData> = new AsyncLocalStorage<AppContextData>();

    public run<T>(data: AppContextData, fn: () => T): T {
        return this.storage.run(data, fn);
    }

    public get(): AppContextData {
        const data: AppContextData | undefined = this.storage.getStore();
        if (!data) {
            throw new MissingContextError();
        }
        return data;
    }

    public getOrNull(): AppContextData | null {
        return this.storage.getStore() ?? null;
    }

    public enrich(data: Partial<Omit<AppContextData, 'requestId'>>): void {
        this.storage.enterWith({ ...this.get(), ...data });
    }
}
