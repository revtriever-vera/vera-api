import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const DIRECTORY: string = 'issuers-directory';

@Injectable()
export class IssuersLogService {
    public constructor(private readonly logService: LogService) {}

    public loaded(institutions: number, groups: number): void {
        this.logService.info({ message: 'issuer directory loaded', identifier: DIRECTORY, meta: { institutions, groups } });
    }

    public failed(error: unknown): void {
        this.logService.error({ message: 'issuer directory is invalid', identifier: DIRECTORY, error });
    }
}
