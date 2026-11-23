import { describe, expect, it, vi } from 'vitest';
import { makePrototypeSnapshot } from '../../../../test/support/portfolio-fixtures';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ConcentrationLogService } from '../services/concentration-log.service';
import { ConcentrationMetricsService } from '../services/concentration-metrics.service';
import { ConcentrationApplication } from './concentration.application';

function build() {
    const snapshot = makePrototypeSnapshot();
    const group = vi.fn((id: string) => (id === 'tesouro-nacional' ? { id, name: 'Tesouro Nacional' } : null));
    const computed = vi.fn();
    const requested = vi.fn();
    const unmappedRatio = vi.fn();
    const application = new ConcentrationApplication(
        { build: vi.fn().mockResolvedValue(snapshot) } as unknown as PortfolioSnapshotService,
        { group } as unknown as IssuerDirectoryService,
        { computed } as unknown as ConcentrationLogService,
        { requested, unmappedRatio } as unknown as ConcentrationMetricsService
    );
    return { application, snapshot, computed, requested, unmappedRatio };
}

describe('ConcentrationApplication', () => {
    it('answers both blocks with the group names and reports', async () => {
        const doubles = build();

        const response = await doubles.application.get();

        expect(response).toMatchObject({ asOf: doubles.snapshot.asOf, baseCurrency: 'BRL', totalMinor: doubles.snapshot.totalMinor });
        expect(response.byIssuer.find((row) => row.key === 'tesouro-nacional')?.name).toBe('Tesouro Nacional');
        expect(response.byIssuer.find((row) => row.key === 'crypto')?.name).toBeNull();
        expect(response.bySector.length).toBeGreaterThan(0);
        expect(doubles.requested).toHaveBeenCalledOnce();
        expect(doubles.unmappedRatio).toHaveBeenCalledWith('issuer', expect.any(Number));
        expect(doubles.unmappedRatio).toHaveBeenCalledWith('sector', expect.any(Number));
        expect(doubles.computed).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
    });
});
