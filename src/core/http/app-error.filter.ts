import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';
import { AppError } from '../../shared/errors/app.error';
import { AppContext } from '../context/app-context.port';
import { LogService } from '../observability/log.service';

const LOG_IDENTIFIER: string = 'http-error';
const FALLBACK_CODE: string = 'internal_error';
const VALIDATION_CODE: string = 'validation_failed';
const HTTP_FALLBACK_CODE: string = 'http_error';
const CODE_BY_STATUS: Readonly<Record<number, string>> = {
    400: VALIDATION_CODE,
    401: 'unauthorized',
    403: 'forbidden',
    404: 'not_found',
    405: 'method_not_allowed',
    409: 'conflict',
    413: 'payload_too_large',
    429: 'too_many_requests'
};
const FALLBACK_DETAIL: string = 'Unexpected error.';
const SERVER_ERROR_FLOOR: number = 500;

interface ProblemBody {
    readonly type: string;
    readonly title: string;
    readonly status: number;
    readonly detail: string;
    readonly requestId: string | null;
    readonly meta?: Readonly<Record<string, unknown>>;
}

@Catch()
export class AppErrorFilter implements ExceptionFilter {
    public constructor(
        private readonly context: AppContext,
        private readonly logService: LogService
    ) {}

    public catch(exception: unknown, host: ArgumentsHost): void {
        const response: Response = host.switchToHttp().getResponse<Response>();
        const body: ProblemBody = this.toProblem(exception);
        response.status(body.status).json(body);
    }

    private toProblem(exception: unknown): ProblemBody {
        if (exception instanceof AppError) {
            return this.fromAppError(exception);
        }
        if (exception instanceof HttpException) {
            return this.fromHttpException(exception);
        }
        return this.fromUnknown(exception);
    }

    private fromAppError(error: AppError): ProblemBody {
        this.logServerError(error.status, error.code, error, error.meta);
        return {
            type: error.code,
            title: error.name,
            status: error.status,
            detail: error.detail,
            requestId: this.requestId(),
            meta: error.meta
        };
    }

    private fromHttpException(exception: HttpException): ProblemBody {
        const status: number = exception.getStatus();
        const raw: string | object = exception.getResponse();
        const meta: Readonly<Record<string, unknown>> | undefined = typeof raw === 'object' ? { ...raw } : undefined;
        const code: string = CODE_BY_STATUS[status] ?? (status >= SERVER_ERROR_FLOOR ? FALLBACK_CODE : HTTP_FALLBACK_CODE);
        this.logServerError(status, code, exception, meta);
        return {
            type: code,
            title: exception.name,
            status,
            detail: typeof raw === 'string' && raw.length > 0 ? raw : exception.message,
            requestId: this.requestId(),
            meta
        };
    }

    private fromUnknown(exception: unknown): ProblemBody {
        this.logService.error({ message: 'unhandled exception', identifier: LOG_IDENTIFIER, error: exception });
        return {
            type: FALLBACK_CODE,
            title: 'InternalServerError',
            status: 500,
            detail: FALLBACK_DETAIL,
            requestId: this.requestId()
        };
    }

    private logServerError(status: number, code: string, error: unknown, meta?: Readonly<Record<string, unknown>>): void {
        if (status < SERVER_ERROR_FLOOR) {
            return;
        }
        this.logService.error({ message: 'request failed', identifier: LOG_IDENTIFIER, error, meta: { ...meta, code, status } });
    }

    private requestId(): string | null {
        return this.context.getOrNull()?.requestId ?? null;
    }
}
