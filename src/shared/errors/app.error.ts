export interface AppErrorOptions {
    readonly code: string;
    readonly status: number;
    readonly detail?: string;
    readonly meta?: Readonly<Record<string, unknown>>;
    readonly cause?: unknown;
}

export abstract class AppError extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly detail: string;
    public readonly meta: Readonly<Record<string, unknown>> | undefined;

    public constructor(options: AppErrorOptions) {
        super(options.code, { cause: options.cause });
        this.name = new.target.name;
        this.code = options.code;
        this.status = options.status;
        this.detail = options.detail ?? options.code;
        this.meta = options.meta;
    }
}
