import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { holdingOf, snapshotOf } from '../domain/export-fixtures';
import { PortfolioAccountSpreadsheet } from './portfolio-account.spreadsheet';
import { PortfolioExportTableService } from './portfolio-export-table.service';
import { XlsxWriterService } from './xlsx-writer.service';

describe('PortfolioAccountSpreadsheet', () => {
    it('writes the carteira sheet from the same table as the portfolio export, without sample holdings', async () => {
        const holdings = [
            holdingOf({ symbol: 'ITUB4' }),
            { ...holdingOf({ symbol: 'EXEMPLO3' }), isSample: true },
            holdingOf({ symbol: '=SOMA' })
        ];
        const tables: PortfolioExportTableService = new PortfolioExportTableService(
            { build: vi.fn().mockResolvedValue(snapshotOf(holdings)) } as unknown as PortfolioSnapshotService,
            { get: vi.fn().mockReturnValue({ requestId: 'r', locale: 'pt-BR' }) } as unknown as AppContext,
            { find: vi.fn().mockReturnValue(null), resolve: vi.fn().mockReturnValue(null) } as unknown as IssuerDirectoryService,
            { list: vi.fn().mockResolvedValue([]) } as unknown as MemberDirectoryService
        );
        const sheets = await new PortfolioAccountSpreadsheet(tables, new XlsxWriterService()).sheets();
        const rows: unknown[][] = [];
        for await (const row of sheets[0]?.rows ?? []) {
            rows.push([...row]);
        }

        expect(sheets).toHaveLength(1);
        expect([sheets[0]?.file, sheets[0]?.name]).toEqual(['carteira', 'Carteira']);
        expect(sheets[0]?.columns[0]?.header).toBe('Ativo');
        expect(rows.map((row: unknown[]) => row[0])).toEqual(['ITUB4', "'=SOMA"]);
    });
});
