import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeCategory, makeRule } from '../../../../test/support/spending-factories';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { CategoryNotFoundError, InvalidRuleError, RuleConflictError, RuleNotFoundError } from '../domain/categories.errors';
import { CategoryRule } from '../domain/categories.types';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { CategoryReaderService } from '../services/category-reader.service';
import { RecategorizationRegistry } from '../services/recategorization.registry';
import { SpendingCategoriesLogService } from '../services/spending-categories-log.service';
import { SpendingCategoriesMetricsService } from '../services/spending-categories-metrics.service';
import { RuleApplication } from './rule.application';

interface Built {
    readonly application: RuleApplication;
    readonly rules: Record<string, ReturnType<typeof vi.fn>>;
    readonly recategorize: ReturnType<typeof vi.fn>;
    readonly countMatches: ReturnType<typeof vi.fn>;
    readonly ruleWritten: ReturnType<typeof vi.fn>;
}

function build(current: CategoryRule | null = makeRule({ id: 'r1' })): Built {
    const rules: Record<string, ReturnType<typeof vi.fn>> = {
        listActive: vi.fn().mockResolvedValue([makeRule({ id: 'r1' })]),
        findById: vi.fn().mockResolvedValue(current),
        create: vi.fn().mockImplementation((input: object) => Promise.resolve(makeRule({ id: 'created', ...input }))),
        update: vi
            .fn()
            .mockImplementation((id: string, input: object) => Promise.resolve(id === 'vanished' ? null : makeRule({ id, ...input }))),
        remove: vi.fn().mockResolvedValue(undefined)
    };
    const recategorize: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(7);
    const countMatches: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(4);
    const ruleWritten: ReturnType<typeof vi.fn> = vi.fn();
    const reader: CategoryReaderService = {
        requireById: vi
            .fn()
            .mockImplementation((id: string) =>
                id === 'missing' ? Promise.reject(new CategoryNotFoundError(id)) : Promise.resolve(makeCategory({ id }))
            )
    } as unknown as CategoryReaderService;
    const application: RuleApplication = new RuleApplication(
        rules as unknown as CategoryRuleDomain,
        reader,
        { recategorize, countMatches } as unknown as RecategorizationRegistry,
        { ruleWritten } as unknown as SpendingCategoriesLogService,
        { ruleAction: vi.fn() } as unknown as SpendingCategoriesMetricsService
    );
    return { application, rules, recategorize, countMatches, ruleWritten };
}

beforeEach(() => {
    TransactionalContext.set({ withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => fn() } as unknown as DatabaseClient);
});

describe('RuleApplication.list e preview', () => {
    it('lista as regras na visão pública', async () => {
        await expect(build().application.list()).resolves.toMatchObject([{ id: 'r1', matchType: 'contains' }]);
    });

    it('prévia normaliza o padrão e conta pela porta', async () => {
        const built: Built = build();

        const preview = await built.application.preview({ matchType: 'contains', pattern: 'Padaria *Estrela', appliesTo: 'out' });

        expect(preview).toEqual({ normalizedPattern: 'PADARIA ESTRELA', matches: 4 });
        expect(built.countMatches).toHaveBeenCalledWith({ matchType: 'contains', pattern: 'PADARIA ESTRELA', appliesTo: 'out' });
    });

    it('padrão que some na normalização é inválido', async () => {
        await expect(
            build().application.preview({ matchType: 'description', pattern: '12345678', appliesTo: 'any' })
        ).rejects.toBeInstanceOf(InvalidRuleError);
    });

    it('contains exige de 2 a 80 caracteres depois de normalizar; description aceita 1', async () => {
        const built: Built = build();

        await expect(built.application.preview({ matchType: 'contains', pattern: 'a', appliesTo: 'any' })).rejects.toBeInstanceOf(
            InvalidRuleError
        );
        await expect(built.application.preview({ matchType: 'contains', pattern: 'ab', appliesTo: 'any' })).resolves.toMatchObject({
            normalizedPattern: 'AB'
        });
        await expect(
            built.application.preview({ matchType: 'contains', pattern: 'a'.repeat(81), appliesTo: 'any' })
        ).rejects.toBeInstanceOf(InvalidRuleError);
        await expect(
            built.application.preview({ matchType: 'contains', pattern: 'a'.repeat(80), appliesTo: 'any' })
        ).resolves.toBeDefined();
        await expect(built.application.preview({ matchType: 'description', pattern: 'a', appliesTo: 'any' })).resolves.toMatchObject({
            normalizedPattern: 'A'
        });
    });
});

describe('RuleApplication.create', () => {
    const PAYLOAD = { matchType: 'contains', pattern: 'Padaria Estrela', appliesTo: 'out', categoryId: 'c1', applyToPast: true } as const;

    it('grava com padrão normalizado, rótulo digitado e aplica ao passado pela porta', async () => {
        const built: Built = build();

        const saved = await built.application.create(PAYLOAD);

        expect(built.rules['create']).toHaveBeenCalledWith({
            categoryId: 'c1',
            matchType: 'contains',
            pattern: 'PADARIA ESTRELA',
            label: 'Padaria Estrela',
            appliesTo: 'out'
        });
        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'rule_saved', ruleId: 'created' });
        expect(saved.recategorized).toBe(7);
        expect(saved.rule.id).toBe('created');
        expect(built.ruleWritten).toHaveBeenCalledWith('created', 'contains', 'created', 7);
    });

    it('applyToPast falso não chama a porta', async () => {
        const built: Built = build();

        const saved = await built.application.create({ ...PAYLOAD, applyToPast: false });

        expect(built.recategorize).not.toHaveBeenCalled();
        expect(saved.recategorized).toBe(0);
    });

    it('categoria inexistente dá 404 e padrão inválido dá 422 sem gravar', async () => {
        const built: Built = build();

        await expect(built.application.create({ ...PAYLOAD, categoryId: 'missing' })).rejects.toBeInstanceOf(CategoryNotFoundError);
        await expect(built.application.create({ ...PAYLOAD, pattern: '***' })).rejects.toBeInstanceOf(InvalidRuleError);
        expect(built.rules['create']).not.toHaveBeenCalled();
    });

    it('duplicata do domínio sobe como 409', async () => {
        const built: Built = build();
        built.rules['create']?.mockRejectedValue(new RuleConflictError('existing'));

        await expect(built.application.create(PAYLOAD)).rejects.toMatchObject({
            code: 'categories.rule_conflict',
            meta: { ruleId: 'existing' }
        });
    });
});

describe('RuleApplication.update e remove', () => {
    it('troca a categoria validando o destino e recategoriza', async () => {
        const built: Built = build();

        const saved = await built.application.update('r1', { categoryId: 'c2' });

        expect(built.rules['update']).toHaveBeenCalledWith('r1', { categoryId: 'c2' }, expect.objectContaining({ id: 'r1' }));
        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'rule_saved', ruleId: 'r1' });
        expect(saved.recategorized).toBe(7);
    });

    it('troca só a direção sem consultar categoria', async () => {
        const built: Built = build();

        await expect(built.application.update('r1', { appliesTo: 'in' })).resolves.toMatchObject({ recategorized: 7 });
    });

    it('404 para regra inexistente, categoria inexistente ou regra que sumiu', async () => {
        await expect(build(null).application.update('r1', {})).rejects.toBeInstanceOf(RuleNotFoundError);
        await expect(build().application.update('r1', { categoryId: 'missing' })).rejects.toBeInstanceOf(CategoryNotFoundError);
        await expect(build(makeRule({ id: 'vanished' })).application.update('vanished', {})).rejects.toBeInstanceOf(RuleNotFoundError);
    });

    it('exclui e recategoriza pelo pipeline', async () => {
        const built: Built = build();

        await expect(built.application.remove('r1')).resolves.toEqual({ recategorized: 7 });

        expect(built.rules['remove']).toHaveBeenCalledWith('r1');
        expect(built.recategorize).toHaveBeenCalledWith({ kind: 'rule_removed', ruleId: 'r1' });
        await expect(build(null).application.remove('r1')).rejects.toBeInstanceOf(RuleNotFoundError);
    });
});
