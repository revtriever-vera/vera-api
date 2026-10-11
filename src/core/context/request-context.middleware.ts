import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AppLocale, resolveLocale } from '../../shared/i18n/locale';
import { IdUtil } from '../../shared/utils/id.util';
import { AppContext } from './app-context.port';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    public constructor(private readonly context: AppContext) {}

    public use(req: Request, res: Response, next: NextFunction): void {
        const requestId: string = this.resolveRequestId(req);
        const locale: AppLocale = this.resolveLocale(req);
        res.setHeader('x-request-id', requestId);
        this.context.run({ requestId, locale }, () => {
            next();
        });
    }

    private resolveRequestId(req: Request): string {
        const header: string | string[] | undefined = req.headers['x-request-id'];
        if (typeof header === 'string' && header.length > 0) {
            return header;
        }
        return IdUtil.newId();
    }

    private resolveLocale(req: Request): AppLocale {
        return resolveLocale(req.headers['accept-language']);
    }
}
