import { describe, expect, it } from 'vitest';
import { ICON_KEYS } from '../domain/categories.types';
import { SYSTEM_CATEGORIES } from '../domain/system-categories';
import {
    createCategorySchema,
    createRuleSchema,
    previewRuleSchema,
    removeCategoryQuerySchema,
    updateCategorySchema,
    updateRuleSchema
} from './categories.schemas';

const CATEGORY_ID: string = '0199c3a0-7b1e-7c52-9d0e-3f6a1b2c4d5e';

describe('categories schemas', () => {
    it('a lista fechada de ícones tem 24 nomes e cobre os ícones das categorias padrão', () => {
        expect(ICON_KEYS).toHaveLength(24);
        expect(new Set(ICON_KEYS).size).toBe(24);
        expect(SYSTEM_CATEGORIES.every((seed) => ICON_KEYS.includes(seed.icon))).toBe(true);
    });

    it('despesa exige flexibilidade e renda não aceita', () => {
        expect(createCategorySchema.safeParse({ name: 'Pets', kind: 'expense', icon: 'PawPrint' }).success).toBe(false);
        expect(createCategorySchema.safeParse({ name: 'Pets', kind: 'expense', flexibility: 'flexible', icon: 'PawPrint' }).success).toBe(
            true
        );
        expect(createCategorySchema.safeParse({ name: 'Bico', kind: 'income', icon: 'Briefcase' }).success).toBe(true);
        expect(createCategorySchema.safeParse({ name: 'Bico', kind: 'income', flexibility: 'fixed', icon: 'Briefcase' }).success).toBe(
            false
        );
    });

    it('transferência não é criável e o ícone precisa estar na lista', () => {
        expect(createCategorySchema.safeParse({ name: 'X', kind: 'transfer', icon: 'Home' }).success).toBe(false);
        expect(createCategorySchema.safeParse({ name: 'X', kind: 'income', icon: 'Rocket' }).success).toBe(false);
    });

    it('nome é aparado, limitado a 40 e sem caractere de controle', () => {
        const base = { kind: 'income', icon: 'Home' };

        expect(createCategorySchema.parse({ ...base, name: '  Bico  ' }).name).toBe('Bico');
        expect(createCategorySchema.safeParse({ ...base, name: '' }).success).toBe(false);
        expect(createCategorySchema.safeParse({ ...base, name: 'x'.repeat(41) }).success).toBe(false);
        expect(createCategorySchema.safeParse({ ...base, name: 'a\nb' }).success).toBe(false);
    });

    it('PATCH aceita name nulo e recusa kind e campos extras', () => {
        expect(updateCategorySchema.safeParse({ name: null }).success).toBe(true);
        expect(updateCategorySchema.safeParse({ kind: 'income' }).success).toBe(false);
    });

    it('moveTo é um uuid opcional', () => {
        expect(removeCategoryQuerySchema.safeParse({}).success).toBe(true);
        expect(removeCategoryQuerySchema.safeParse({ moveTo: CATEGORY_ID }).success).toBe(true);
        expect(removeCategoryQuerySchema.safeParse({ moveTo: 'nope' }).success).toBe(false);
    });

    it('regra: applyToPast vale true por padrão e counterparty nunca é digitada', () => {
        const base = { matchType: 'contains', pattern: 'padaria', appliesTo: 'out', categoryId: CATEGORY_ID };

        expect(createRuleSchema.parse(base).applyToPast).toBe(true);
        expect(createRuleSchema.parse({ ...base, applyToPast: false }).applyToPast).toBe(false);
        expect(createRuleSchema.safeParse({ ...base, matchType: 'counterparty' }).success).toBe(false);
        expect(previewRuleSchema.safeParse({ matchType: 'counterparty', pattern: 'x', appliesTo: 'any' }).success).toBe(false);
        expect(previewRuleSchema.safeParse({ matchType: 'description', pattern: 'x', appliesTo: 'any' }).success).toBe(true);
    });

    it('PATCH da regra só aceita categoryId e appliesTo', () => {
        expect(updateRuleSchema.safeParse({ categoryId: CATEGORY_ID, appliesTo: 'in' }).success).toBe(true);
        expect(updateRuleSchema.safeParse({ pattern: 'x' }).success).toBe(false);
    });
});
