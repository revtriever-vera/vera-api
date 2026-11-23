import { Injectable } from '@nestjs/common';
import { AppError } from '../../shared/errors/app.error';
import { ThrottleDomain } from './domain/throttle.domain';

export class TooManyAttemptsError extends AppError {
    public constructor() {
        super({
            code: 'core.too_many_attempts',
            status: 429,
            detail: 'Too many attempts for this key within the configured window.'
        });
    }
}

@Injectable()
export class ThrottleService {
    public constructor(private readonly throttles: ThrottleDomain) {}

    public async assertAllowed(key: string, limit: number, windowSeconds: number): Promise<void> {
        if (!(await this.isAllowed(key, limit, windowSeconds))) {
            throw new TooManyAttemptsError();
        }
    }

    public async isAllowed(key: string, limit: number, windowSeconds: number): Promise<boolean> {
        return (await this.throttles.registerAttempt(key, windowSeconds)) <= limit;
    }
}
