import { normalizeSearchText } from '../src/modules/issuers/domain/issuer-search';
import { IssuerRecord } from '../src/modules/issuers/domain/issuer.types';

export interface SourceDifferences {
    readonly missingInConglomerates: readonly string[];
    readonly missingInFgc: readonly string[];
    readonly notListed: readonly string[];
}

export function namesOf(content: string): string[] {
    return content
        .split(/\r?\n/)
        .map((line: string): string => (line.split(';')[0] ?? '').replace(/^"|"$/g, '').trim())
        .filter((name: string): boolean => name.length > 0);
}

function normalizedSet(names: readonly string[]): Set<string> {
    return new Set(names.map(normalizeSearchText));
}

function knownBy(record: IssuerRecord, source: ReadonlySet<string>): boolean {
    return [record.name, ...record.aliases].some((name: string): boolean => source.has(normalizeSearchText(name)));
}

export function compareSources(
    institutions: readonly IssuerRecord[],
    conglomerateNames: readonly string[],
    fgcNames: readonly string[]
): SourceDifferences {
    const conglomerates: Set<string> = normalizedSet(conglomerateNames);
    const fgc: Set<string> = normalizedSet(fgcNames);
    const banks: IssuerRecord[] = institutions.filter((record: IssuerRecord): boolean => record.kind === 'bank');
    const listed: Set<string> = new Set(
        banks.flatMap((record: IssuerRecord): string[] => [record.name, ...record.aliases].map(normalizeSearchText))
    );
    return {
        missingInConglomerates: banks
            .filter((record: IssuerRecord): boolean => !knownBy(record, conglomerates))
            .map((record: IssuerRecord): string => record.id),
        missingInFgc: banks
            .filter((record: IssuerRecord): boolean => record.fgcAssociated && !knownBy(record, fgc))
            .map((record: IssuerRecord): string => record.id),
        notListed: fgcNames.filter((name: string): boolean => !listed.has(normalizeSearchText(name)))
    };
}
