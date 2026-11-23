import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { InvalidHolderError } from '../../identity/domain/members.errors';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { PositionDomain } from '../domain/position.domain';
import {
    AssetAlreadyInPortfolioError,
    AssetNotAvailableError,
    ClassRequiredError,
    InvalidQuantityError,
    PositionLimitReachedError,
    PositionNotFoundError
} from '../domain/positions.errors';
import { Position } from '../domain/positions.types';
import { PositionsLogService } from '../services/positions-log.service';
import { PositionsMetricsService } from '../services/positions-metrics.service';
import { PositionApplication } from './position.application';

type Mock = ReturnType<typeof vi.fn>;

beforeAll(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

function makeAsset(overrides: Partial<Asset> = {}): Asset {
    return {
        id: 'asset-1',
        status: 'active',
        quantityDecimals: 0,
        suggestedClassKey: 'acoes_br',
        ...overrides
    } as Asset;
}

function makePosition(overrides: Partial<Position> = {}): Position {
    return {
        id: 'position-1',
        companyId: 'company-1',
        assetId: 'asset-1',
        quantity: '40.0000000000',
        averagePrice: null,
        holderUserId: null,
        createdAt: new Date('2026-10-11T10:00:00.000Z'),
        updatedAt: new Date('2026-10-11T10:00:00.000Z'),
        deletedAt: null,
        isSample: false,
        ...overrides
    };
}

interface Doubles {
    readonly application: PositionApplication;
    readonly domain: Record<string, Mock>;
    readonly assignments: Record<string, Mock>;
    readonly resolveBySystemKey: Mock;
    readonly logs: Record<string, Mock>;
    readonly metrics: Mock;
    readonly requireActive: Mock;
}

function build(asset: Asset = makeAsset(), domainOverrides: Record<string, Mock> = {}): Doubles {
    const domain: Record<string, Mock> = {
        createIfAbsent: vi.fn().mockResolvedValue(makePosition()),
        findById: vi.fn().mockResolvedValue(makePosition()),
        findByAssetAndHolder: vi.fn().mockResolvedValue(makePosition({ id: 'existing' })),
        countAll: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue(makePosition({ quantity: '10.0000000000' })),
        remove: vi.fn().mockResolvedValue(true),
        ...domainOverrides
    };
    const assignments: Record<string, Mock> = {
        assign: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockResolvedValue(undefined),
        requireClassId: vi.fn().mockResolvedValue('class-1')
    };
    const resolveBySystemKey: Mock = vi.fn().mockResolvedValue({ id: 'class-suggested' });
    const logs: Record<string, Mock> = { written: vi.fn(), duplicate: vi.fn() };
    const metrics: Mock = vi.fn();
    const requireActive: Mock = vi
        .fn()
        .mockImplementation((userId: string) =>
            userId === 'outsider' ? Promise.reject(new InvalidHolderError()) : Promise.resolve({ userId, name: 'Ana' })
        );
    const application: PositionApplication = new PositionApplication(
        domain as unknown as PositionDomain,
        { requireById: vi.fn().mockResolvedValue(asset) } as unknown as AssetCatalogService,
        assignments as unknown as ClassAssignmentService,
        { resolveBySystemKey } as unknown as ClassResolverService,
        { requireActive } as unknown as MemberDirectoryService,
        logs as unknown as PositionsLogService,
        { action: metrics } as unknown as PositionsMetricsService
    );
    return { application, domain, assignments, resolveBySystemKey, logs, metrics, requireActive };
}

describe('PositionApplication.create', () => {
    it('sem classId usa a classe sugerida pelo catálogo e grava a atribuição', async () => {
        const doubles: Doubles = build();

        const view = await doubles.application.create({ assetId: 'asset-1', quantity: '40' });

        expect(doubles.resolveBySystemKey).toHaveBeenCalledWith('acoes_br');
        expect(doubles.assignments['assign']).toHaveBeenCalledWith('position', 'position-1', 'class-suggested');
        expect(view).toMatchObject({ id: 'position-1', quantity: '40', classId: 'class-suggested', averagePrice: null });
        expect(doubles.logs['written']).toHaveBeenCalledWith('created', 'position-1', 'asset-1');
        expect(doubles.metrics).toHaveBeenCalledWith('created');
    });

    it('com classId usa a classe pedida sem consultar a sugerida', async () => {
        const doubles: Doubles = build();

        const view = await doubles.application.create({ assetId: 'asset-1', quantity: '0', averagePrice: '10.5', classId: 'class-chosen' });

        expect(doubles.resolveBySystemKey).not.toHaveBeenCalled();
        expect(doubles.assignments['assign']).toHaveBeenCalledWith('position', 'position-1', 'class-chosen');
        expect(doubles.domain['createIfAbsent']).toHaveBeenCalledWith({
            assetId: 'asset-1',
            quantity: '0',
            averagePrice: '10.5',
            holderUserId: null
        });
        expect(view.classId).toBe('class-chosen');
    });

    it('grava o titular informado depois de validar que é membro ativo', async () => {
        const doubles: Doubles = build(makeAsset(), { createIfAbsent: vi.fn().mockResolvedValue(makePosition({ holderUserId: 'ana' })) });

        const view = await doubles.application.create({ assetId: 'asset-1', quantity: '1', holderUserId: 'ana' });

        expect(doubles.requireActive).toHaveBeenCalledWith('ana');
        expect(doubles.domain['createIfAbsent']).toHaveBeenCalledWith(expect.objectContaining({ holderUserId: 'ana' }));
        expect(view.holderUserId).toBe('ana');
    });

    it('quem não é membro ativo não pode ser titular e nada é gravado', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '1', holderUserId: 'outsider' })).rejects.toBeInstanceOf(
            InvalidHolderError
        );
        expect(doubles.domain['createIfAbsent']).not.toHaveBeenCalled();
    });

    it('o duplicado é procurado dentro do mesmo titular', async () => {
        const doubles: Doubles = build(makeAsset(), { createIfAbsent: vi.fn().mockResolvedValue(null) });

        await doubles.application.create({ assetId: 'asset-1', quantity: '1', holderUserId: 'ana' }).catch((error: unknown) => error);

        expect(doubles.domain['findByAssetAndHolder']).toHaveBeenCalledWith('asset-1', 'ana');
    });

    it('sugerida nula sem classId lança class_required', async () => {
        const doubles: Doubles = build(makeAsset({ suggestedClassKey: null }));

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '1' })).rejects.toBeInstanceOf(ClassRequiredError);
        expect(doubles.domain['createIfAbsent']).not.toHaveBeenCalled();
    });

    it('ativo delisted é recusado', async () => {
        const doubles: Doubles = build(makeAsset({ status: 'delisted' }));

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '1' })).rejects.toBeInstanceOf(AssetNotAvailableError);
    });

    it('quantidade com mais casas que o ativo permite lança invalid_quantity', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '2.5' })).rejects.toBeInstanceOf(InvalidQuantityError);
    });

    it('conflito de unicidade vira AssetAlreadyInPortfolioError com o id da existente', async () => {
        const doubles: Doubles = build(makeAsset(), { createIfAbsent: vi.fn().mockResolvedValue(null) });

        const failure: unknown = await doubles.application.create({ assetId: 'asset-1', quantity: '1' }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(AssetAlreadyInPortfolioError);
        expect((failure as AssetAlreadyInPortfolioError).meta).toEqual({ positionId: 'existing' });
        expect(doubles.logs['duplicate']).toHaveBeenCalledWith('asset-1', 'existing');
        expect(doubles.assignments['assign']).not.toHaveBeenCalled();
    });

    it('conflito sem linha viva (corrida com remoção) falha com erro interno', async () => {
        const doubles: Doubles = build(makeAsset(), {
            createIfAbsent: vi.fn().mockResolvedValue(null),
            findByAssetAndHolder: vi.fn().mockResolvedValue(null)
        });

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '1' })).rejects.toThrow('Positions conflict');
    });

    it('recusa a 501ª posição', async () => {
        const doubles: Doubles = build(makeAsset(), { countAll: vi.fn().mockResolvedValue(500) });

        await expect(doubles.application.create({ assetId: 'asset-1', quantity: '1' })).rejects.toBeInstanceOf(PositionLimitReachedError);
        expect(doubles.domain['createIfAbsent']).not.toHaveBeenCalled();
    });
});

describe('PositionApplication.get, update e remove', () => {
    it('get devolve a posição com a classe', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.get('position-1')).resolves.toMatchObject({ id: 'position-1', classId: 'class-1' });
    });

    it('posição inexistente lança position_not_found', async () => {
        const doubles: Doubles = build(makeAsset(), { findById: vi.fn().mockResolvedValue(null) });

        await expect(doubles.application.get('x')).rejects.toBeInstanceOf(PositionNotFoundError);
        await expect(doubles.application.update('x', { quantity: '1' })).rejects.toBeInstanceOf(PositionNotFoundError);
        await expect(doubles.application.remove('x')).rejects.toBeInstanceOf(PositionNotFoundError);
    });

    it('update valida as casas da quantidade contra o ativo e grava só o que veio', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.update('position-1', { quantity: '1.5' })).rejects.toBeInstanceOf(InvalidQuantityError);
        const view = await doubles.application.update('position-1', { quantity: '10' });

        expect(doubles.domain['update']).toHaveBeenCalledWith('position-1', { quantity: '10', averagePrice: undefined });
        expect(view.quantity).toBe('10');
        expect(doubles.logs['written']).toHaveBeenCalledWith('updated', 'position-1', 'asset-1');
    });

    it('update só do preço médio não consulta o catálogo e aceita null para limpar', async () => {
        const doubles: Doubles = build();

        await doubles.application.update('position-1', { averagePrice: null });

        expect(doubles.domain['update']).toHaveBeenCalledWith('position-1', { quantity: undefined, averagePrice: null });
    });

    it('update troca o titular depois de validar e de checar o duplicado do novo titular', async () => {
        const doubles: Doubles = build(makeAsset(), { findByAssetAndHolder: vi.fn().mockResolvedValue(null) });

        await doubles.application.update('position-1', { holderUserId: 'ana' });

        expect(doubles.domain['findByAssetAndHolder']).toHaveBeenCalledWith('asset-1', 'ana');
        expect(doubles.domain['update']).toHaveBeenCalledWith('position-1', expect.objectContaining({ holderUserId: 'ana' }));
    });

    it('update para a conta toda checa o duplicado sem consultar membros', async () => {
        const doubles: Doubles = build(makeAsset(), {
            findById: vi.fn().mockResolvedValue(makePosition({ holderUserId: 'ana' })),
            findByAssetAndHolder: vi.fn().mockResolvedValue(null)
        });

        await doubles.application.update('position-1', { holderUserId: null });

        expect(doubles.requireActive).not.toHaveBeenCalled();
        expect(doubles.domain['findByAssetAndHolder']).toHaveBeenCalledWith('asset-1', null);
    });

    it('update para um titular que já tem o ativo aponta a posição existente', async () => {
        const doubles: Doubles = build();

        const failure: unknown = await doubles.application.update('position-1', { holderUserId: 'ana' }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(AssetAlreadyInPortfolioError);
        expect((failure as AssetAlreadyInPortfolioError).meta).toEqual({ positionId: 'existing' });
        expect(doubles.domain['update']).not.toHaveBeenCalled();
    });

    it('update com o mesmo titular não confere nada', async () => {
        const doubles: Doubles = build();

        await doubles.application.update('position-1', { holderUserId: null, quantity: '10' });

        expect(doubles.domain['findByAssetAndHolder']).not.toHaveBeenCalled();
    });

    it('update cuja linha some entre a leitura e a escrita relê e lança not_found', async () => {
        const doubles: Doubles = build(makeAsset(), {
            findById: vi.fn().mockResolvedValueOnce(makePosition()).mockResolvedValueOnce(null),
            update: vi.fn().mockResolvedValue(null)
        });

        await expect(doubles.application.update('position-1', { quantity: '1' })).rejects.toBeInstanceOf(PositionNotFoundError);
    });

    it('remove apaga a posição, libera a atribuição e registra', async () => {
        const doubles: Doubles = build();

        await doubles.application.remove('position-1');

        expect(doubles.domain['remove']).toHaveBeenCalledWith('position-1');
        expect(doubles.assignments['release']).toHaveBeenCalledWith('position', 'position-1');
        expect(doubles.logs['written']).toHaveBeenCalledWith('removed', 'position-1', 'asset-1');
        expect(doubles.metrics).toHaveBeenCalledWith('removed');
    });
});
