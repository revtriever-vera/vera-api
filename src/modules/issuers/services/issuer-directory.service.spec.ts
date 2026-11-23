import { describe, expect, it, vi } from 'vitest';
import groupsJson from '../data/groups.json';
import institutionsJson from '../data/institutions.json';
import knownIdsJson from '../data/known-ids.json';
import { assertKnownIdsKept } from '../domain/issuer-index';
import { IssuerRecord } from '../domain/issuer.types';
import { groupsSchema, institutionsSchema, knownIdsSchema } from '../validation/issuer-data.schemas';
import { IssuerDirectoryService } from './issuer-directory.service';
import { IssuersLogService } from './issuers-log.service';

function loaded(): { service: IssuerDirectoryService; logs: { loaded: ReturnType<typeof vi.fn>; failed: ReturnType<typeof vi.fn> } } {
    const logs = { loaded: vi.fn(), failed: vi.fn() };
    const service: IssuerDirectoryService = new IssuerDirectoryService(logs as unknown as IssuersLogService);
    service.onModuleInit();
    return { service, logs };
}

describe('curated issuer data', () => {
    const institutions: IssuerRecord[] = institutionsSchema.parse(institutionsJson);

    it('passes the schemas', () => {
        expect(groupsSchema.safeParse(groupsJson).success).toBe(true);
        expect(knownIdsSchema.safeParse(knownIdsJson).success).toBe(true);
    });

    it('keeps every known id and lists nothing that is not known', () => {
        const known: string[] = knownIdsSchema.parse(knownIdsJson);

        expect(() => {
            assertKnownIdsKept(known, new Map(institutions.map((entry: IssuerRecord): [string, IssuerRecord] => [entry.id, entry])));
        }).not.toThrow();
        expect(institutions.map((entry: IssuerRecord) => entry.id)).toEqual(known);
    });

    it('covers the banks of the prototype with the conglomerate of each one', () => {
        const groupOf: Map<string, string> = new Map(
            institutions.map((entry: IssuerRecord): [string, string] => [entry.id, entry.groupId])
        );

        expect(groupOf.get('banco-pan')).toBe('btg-pactual');
        expect(groupOf.get('banco-xp')).toBe('xp');
        expect(groupOf.get('banco-inter')).toBe('inter-co');
        for (const id of [
            'itau-unibanco',
            'bradesco',
            'banco-do-brasil',
            'santander',
            'btg-pactual',
            'c6-bank',
            'banco-sofisa',
            'banco-daycoval',
            'banco-bmg'
        ]) {
            expect(groupOf.has(id)).toBe(true);
        }
    });

    it('lists the banks as FGC associated and the others as not associated', () => {
        const wrong: string[] = institutions
            .filter((entry: IssuerRecord) => entry.fgcAssociated !== (entry.kind === 'bank'))
            .map((entry: IssuerRecord) => entry.id);

        expect(wrong).toEqual([]);
    });

    it('has no alias that repeats between two institutions', () => {
        const aliases: string[] = institutions.flatMap((entry: IssuerRecord) => entry.aliases.map((alias: string) => alias.toLowerCase()));

        expect(new Set(aliases).size).toBe(aliases.length);
    });
});

describe('IssuerDirectoryService', () => {
    it('loads the curated data on boot and logs the counts', () => {
        const { logs } = loaded();

        expect(logs.loaded).toHaveBeenCalledWith(institutionsJson.length, groupsJson.length);
    });

    it('finds an institution and answers null for an unknown id', () => {
        const { service } = loaded();

        expect(service.find('banco-inter')).toMatchObject({ name: 'Banco Inter', groupId: 'inter-co', kind: 'bank' });
        expect(service.find('nao-existe')).toBeNull();
    });

    it('resolves the institution with the name of its group', () => {
        const { service } = loaded();

        expect(service.resolve('banco-pan')).toMatchObject({ groupId: 'btg-pactual', groupName: 'BTG Pactual' });
        expect(service.resolve('nao-existe')).toBeNull();
    });

    it('finds a group', () => {
        const { service } = loaded();

        expect(service.group('inter-co')).toEqual({ id: 'inter-co', name: 'Inter&Co' });
        expect(service.group('nao-existe')).toBeNull();
    });

    it('searches banks by the group name and companies apart', () => {
        const { service } = loaded();

        expect(service.search('inter', 'bank', 20).map((entry) => entry.id)).toContain('banco-inter');
        expect(service.search('petro', 'company', 20).map((entry) => entry.id)).toEqual(['petrobras']);
        expect(service.search('petro', 'bank', 20)).toEqual([]);
        expect(service.search('inter', 'bank', 20)[0]).toMatchObject({ groupName: 'Inter&Co' });
    });

    it('tells whether an issuer fits a security', () => {
        const { service } = loaded();

        expect(service.accepts(service.find('banco-inter') as IssuerRecord, 'cdb', 'BRL')).toBe(true);
        expect(service.accepts(service.find('banco-inter') as IssuerRecord, 'debenture', 'BRL')).toBe(false);
    });

    it('has the two sovereign entries the concentration needs', () => {
        const { service } = loaded();

        expect(service.resolve('tesouro-nacional')).toMatchObject({ kind: 'sovereign', groupId: 'tesouro-nacional' });
        expect(service.resolve('tesouro-eua')).toMatchObject({ kind: 'sovereign', groupId: 'tesouro-eua' });
    });
});
