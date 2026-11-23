import { describe, expect, it, vi } from 'vitest';
import { IssuerDirectoryService } from '../services/issuer-directory.service';
import { IssuersLogService } from '../services/issuers-log.service';
import { IssuersMetricsService } from '../services/issuers-metrics.service';
import { IssuerSearchApplication } from './issuer-search.application';

function build(): { application: IssuerSearchApplication; search: ReturnType<typeof vi.fn> } {
    const directory: IssuerDirectoryService = new IssuerDirectoryService({
        loaded: vi.fn(),
        failed: vi.fn()
    } as unknown as IssuersLogService);
    directory.onModuleInit();
    const search: ReturnType<typeof vi.fn> = vi.fn();
    const application: IssuerSearchApplication = new IssuerSearchApplication(directory, { search } as unknown as IssuersMetricsService);
    return { application, search };
}

describe('IssuerSearchApplication', () => {
    it('finds Banco Inter with its conglomerate and counts the search by kind', () => {
        const { application, search } = build();

        const response = application.search({ q: 'inter', kind: 'bank' });

        expect(response.items[0]).toEqual({
            id: 'banco-inter',
            name: 'Banco Inter',
            groupId: 'inter-co',
            groupName: 'Inter&Co',
            kind: 'bank',
            fgcAssociated: true,
            status: 'active'
        });
        expect(search).toHaveBeenCalledWith('bank');
    });

    it('searches every kind without text and returns at most 20', () => {
        const { application, search } = build();

        const response = application.search({});

        expect(response.items).toHaveLength(20);
        expect(search).toHaveBeenCalledWith('any');
    });
});
