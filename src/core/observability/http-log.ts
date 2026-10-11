import { IncomingMessage, ServerResponse } from 'node:http';
import { LevelWithSilent } from 'pino';

const HEALTH_PATH: string = '/health';
const REQUEST_ID_HEADER: string = 'x-request-id';
const REQUEST_LEVEL: LevelWithSilent = 'info';
const FIRST_ERROR_STATUS: number = 400;

interface RoutedRequest extends IncomingMessage {
    readonly originalUrl?: string;
}

export function requestLogLevel(req: RoutedRequest, res: ServerResponse, error?: Error): LevelWithSilent {
    const healthyProbe: boolean = isHealthProbe(req) && error === undefined && res.statusCode < FIRST_ERROR_STATUS;
    return healthyProbe ? 'silent' : REQUEST_LEVEL;
}

/** Only binds once the response is out: pino-http also calls this on arrival, and binding there would repeat requestId on app log lines. */
export function requestLogProps(_req: IncomingMessage, res: ServerResponse): Record<string, string> {
    if (!res.headersSent) {
        return {};
    }
    const requestId: number | string | string[] | undefined = res.getHeader(REQUEST_ID_HEADER);
    return typeof requestId === 'string' ? { requestId } : {};
}

function isHealthProbe(req: RoutedRequest): boolean {
    const url: string = req.originalUrl ?? req.url ?? '';
    const [path] = url.split('?');
    return path === HEALTH_PATH;
}
