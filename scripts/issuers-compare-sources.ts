import { readFileSync } from 'node:fs';
import { institutionsSchema } from '../src/modules/issuers/validation/issuer-data.schemas';
import institutionsJson from '../src/modules/issuers/data/institutions.json';
import { compareSources, namesOf, SourceDifferences } from './issuers-compare-core';

function argumentOf(flag: string): string {
    const position: number = process.argv.indexOf(flag);
    const value: string | undefined = process.argv[position + 1];
    if (position < 0 || value === undefined) {
        throw new Error(`uso: npm run issuers:compare -- --bc <arquivo> --fgc <arquivo> (falta ${flag})`);
    }
    return value;
}

function print(title: string, items: readonly string[]): void {
    process.stdout.write(`${title} (${String(items.length)})\n${items.map((item: string): string => `  ${item}`).join('\n')}\n\n`);
}

const differences: SourceDifferences = compareSources(
    institutionsSchema.parse(institutionsJson),
    namesOf(readFileSync(argumentOf('--bc'), 'utf8')),
    namesOf(readFileSync(argumentOf('--fgc'), 'utf8'))
);

print('Bancos da lista que não aparecem nos conglomerados do BC', differences.missingInConglomerates);
print('Bancos marcados como associados que não aparecem na lista do FGC', differences.missingInFgc);
print('Associadas do FGC que não estão na lista curada', differences.notListed);
