import { Injectable } from '@nestjs/common';
import type { MonthlySummary } from '../../spending-summary/services/spending-summary.service';
import { calculateCuts } from '../domain/cuts-calculator';
import { CutsResult } from '../domain/spending-cuts.types';

export type { CutsResult };

@Injectable()
export class SpendingCutsService {
    public compute(summary: MonthlySummary, goalBps: number | undefined): CutsResult {
        return calculateCuts(summary, goalBps);
    }
}
