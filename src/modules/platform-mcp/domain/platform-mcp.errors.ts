import { AppError } from '../../../shared/errors/app.error';

export class PlatformMcpInvalidWindowError extends AppError {
    public constructor() {
        super({
            code: 'platform_mcp.invalid_window',
            status: 422,
            detail: 'The window must go forward and span at most 7 days.'
        });
    }
}
