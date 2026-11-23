import { Injectable, Optional } from '@nestjs/common';
import { PaidUsageSnapshot } from '../domain/plans.types';
import { PaidUsageStatePort } from './paid-usage-state.port';

@Injectable()
export class PaidUsageReader {
    public constructor(@Optional() private readonly port: PaidUsageStatePort | undefined) {}

    public async state(): Promise<PaidUsageSnapshot | null> {
        return this.port === undefined ? null : this.port.state();
    }
}
