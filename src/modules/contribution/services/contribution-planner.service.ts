import { Injectable } from '@nestjs/common';
import type { PortfolioSnapshot } from '../../portfolio/services/portfolio-snapshot.service';
import { ContributionTargetsNotSetError } from '../domain/contribution.errors';
import { ContributionSuggestion } from '../domain/contribution.types';
import { buildSuggestion } from '../domain/suggestion-builder';

export type { ContributionSuggestion };

@Injectable()
export class ContributionPlannerService {
    public planOrNull(snapshot: PortfolioSnapshot, amountMinor: number): ContributionSuggestion | null {
        try {
            return buildSuggestion(snapshot, amountMinor);
        } catch (error: unknown) {
            if (error instanceof ContributionTargetsNotSetError) {
                return null;
            }
            throw error;
        }
    }
}
