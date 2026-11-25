import type { ZodTypeAny } from 'zod';
import { AppLocale } from '../../../shared/i18n/locale';
import type { PlanGateService } from '../../plans/services/plan-gate.service';
import { ASK_VERA_HELP_FEATURE, AskVeraTool, AskVeraToolKind, AskVeraToolOutput } from '../domain/ask-vera.types';

export type PaidFeature = Parameters<PlanGateService['allows']>[0];

export type AskVeraToolFeature = PaidFeature | typeof ASK_VERA_HELP_FEATURE;

export type { AskVeraToolOutput, AskVeraToolProposal } from '../domain/ask-vera.types';

export abstract class AskVeraToolPort implements AskVeraTool {
    public abstract readonly name: string;
    public abstract readonly feature: AskVeraToolFeature;
    public abstract readonly kind: AskVeraToolKind;
    public abstract readonly inputSchema: ZodTypeAny;
    public abstract description(locale: AppLocale): string;
    public abstract run(input: unknown): Promise<AskVeraToolOutput>;
}
