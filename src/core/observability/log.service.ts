import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppContext, AppContextData } from '../context/app-context.port';

export interface LogEntry {
    readonly message: string;
    readonly identifier: string;
    readonly meta?: Readonly<Record<string, unknown>>;
}

export interface ErrorLogEntry extends LogEntry {
    readonly error?: unknown;
}

@Injectable()
export class LogService {
    public constructor(
        private readonly logger: PinoLogger,
        private readonly context: AppContext
    ) {}

    public info(entry: LogEntry): void {
        this.logger.info(this.payload(entry), entry.message);
    }

    public warn(entry: ErrorLogEntry): void {
        this.logger.warn(this.payload(entry), entry.message);
    }

    public error(entry: ErrorLogEntry): void {
        this.logger.error(this.payload(entry), entry.message);
    }

    public debug(entry: LogEntry): void {
        this.logger.debug(this.payload(entry), entry.message);
    }

    private payload(entry: LogEntry | ErrorLogEntry): Record<string, unknown> {
        const ctx: AppContextData | null = this.context.getOrNull();
        return {
            identifier: entry.identifier,
            meta: entry.meta,
            requestId: ctx?.requestId,
            companyId: ctx?.companyId,
            locale: ctx?.locale,
            err: 'error' in entry ? this.serializeError(entry.error) : undefined
        };
    }

    private serializeError(error: unknown): Record<string, unknown> | undefined {
        if (error === undefined) {
            return undefined;
        }
        if (error instanceof Error) {
            return { name: error.name, message: error.message, stack: error.stack };
        }
        return { value: JSON.stringify(error) };
    }
}
