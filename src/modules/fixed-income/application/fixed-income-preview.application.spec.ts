import { describe, expect, it, vi } from 'vitest';
import { TooManyAttemptsError } from '../../../core/throttle/throttle.service';
import { AppContext } from '../../../core/context/app-context.port';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { AppliedDateOutOfRangeError, InvalidTermsError } from '../domain/fixed-income.errors';
import { FixedIncomeValuationService } from '../services/fixed-income-valuation.service';
import { FixedIncomePreviewApplication } from './fixed-income-preview.application';

const BODY = {
    kind: 'cdb' as const,
    indexer: 'cdi_percent' as const,
    rateBps: 11000,
    appliedMinor: 5_000_000,
    appliedAt: '2025-01-06',
    maturityDate: '2030-01-06'
};

function build(allowed: boolean = true) {
    const preview = vi.fn().mockResolvedValue({ valueMinor: 1 });
    const assertAllowed = vi.fn().mockImplementation(() => (allowed ? Promise.resolve() : Promise.reject(new TooManyAttemptsError())));
    const application = new FixedIncomePreviewApplication(
        { preview } as unknown as FixedIncomeValuationService,
        { assertAllowed } as unknown as ThrottleService,
        { get: () => ({ companyId: 'company-1' }) } as unknown as AppContext
    );
    return { application, preview, assertAllowed };
}

describe('FixedIncomePreviewApplication', () => {
    it('limita por company e calcula sem gravar', async () => {
        const doubles = build();

        await expect(doubles.application.preview(BODY)).resolves.toEqual({ valueMinor: 1 });

        expect(doubles.assertAllowed).toHaveBeenCalledWith('fixed-income-preview:company-1', 120, 60);
        expect(doubles.preview.mock.calls[0]?.[0]).toMatchObject({ currency: 'BRL', rateBps: 11000 });
    });

    it('sem company no contexto usa uma chave anônima', async () => {
        const preview = vi.fn().mockResolvedValue({});
        const assertAllowed = vi.fn().mockResolvedValue(undefined);
        const application = new FixedIncomePreviewApplication(
            { preview } as unknown as FixedIncomeValuationService,
            { assertAllowed } as unknown as ThrottleService,
            { get: () => ({}) } as unknown as AppContext
        );

        await application.preview(BODY);

        expect(assertAllowed.mock.calls[0]?.[0]).toBe('fixed-income-preview:anonymous');
    });

    it('passa o limite de taxa adiante quando estoura', async () => {
        const doubles = build(false);

        await expect(doubles.application.preview(BODY)).rejects.toBeInstanceOf(TooManyAttemptsError);
        expect(doubles.preview).not.toHaveBeenCalled();
    });

    it('recusa termos inválidos antes de calcular', async () => {
        const doubles = build();

        await expect(doubles.application.preview({ ...BODY, appliedAt: '2009-01-01' })).rejects.toBeInstanceOf(AppliedDateOutOfRangeError);
        await expect(doubles.application.preview({ ...BODY, currency: 'USD' })).rejects.toBeInstanceOf(InvalidTermsError);
        expect(doubles.preview).not.toHaveBeenCalled();
    });
});
