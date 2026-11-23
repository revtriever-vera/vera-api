import { Injectable } from '@nestjs/common';
import { LlmCallDomain } from '../domain/llm-call.domain';

const RETENTION_MONTHS: number = 13;

@Injectable()
export class LlmCallsHistoryService {
    public constructor(private readonly calls: LlmCallDomain) {}

    public async eraseAll(): Promise<number> {
        return this.calls.eraseAll();
    }

    public async purgeExpired(now: Date = new Date()): Promise<number> {
        const cutoff: Date = new Date(now);
        cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
        return this.calls.purgeBefore(cutoff);
    }
}
