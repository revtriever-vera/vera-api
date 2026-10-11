import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR: string = join(process.cwd(), 'migrations');
const NAME_PATTERN: RegExp = /^(\d{14})_[a-z0-9-]+\.ts$/;

interface Offence {
    readonly reason: string;
    readonly files: readonly string[];
}

function collisions(files: readonly string[]): Offence[] {
    const byPrefix: Map<string, string[]> = new Map();
    for (const file of files) {
        const prefix: string = file.slice(0, 14);
        byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), file]);
    }
    return [...byPrefix.entries()]
        .filter(([, sharing]: [string, string[]]) => sharing.length > 1)
        .map(([prefix, sharing]: [string, string[]]) => ({ reason: `prefixo ${prefix} usado por mais de uma migration`, files: sharing }));
}

function offences(files: readonly string[]): Offence[] {
    const malformed: string[] = files.filter((file: string) => !NAME_PATTERN.test(file));
    return malformed.length > 0
        ? [{ reason: 'nome fora do padrão AAAAMMDDHHMMSS_kebab-case.ts', files: malformed }, ...collisions(files)]
        : collisions(files);
}

const KNOWN_REFS: readonly string[] = ['HEAD', 'MERGE_HEAD', 'origin/main'];

function trackedAt(ref: string): string[] {
    try {
        const tracked: string = execSync(`git ls-tree --name-only ${ref} migrations/`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        return tracked.split('\n').map((path: string) => path.replace('migrations/', '').trim());
    } catch {
        return [];
    }
}

function alreadyOnMain(): ReadonlySet<string> {
    return new Set(KNOWN_REFS.flatMap(trackedAt));
}

function reportOffences(found: readonly Offence[]): void {
    if (found.length === 0) {
        return;
    }
    console.error('\nmigrations com problema de nome:\n');
    const lines: string[] = found.flatMap((offence: Offence) => [
        `  ${offence.reason}`,
        ...offence.files.map((file: string) => `    - ${file}`)
    ]);
    console.error(lines.join('\n'));
    console.error(EXPLAINER);
    process.exit(1);
}

const EXPLAINER: string =
    '\nPrefixo repetido dá ordens de execução diferentes conforme o ambiente, porque o\n' +
    'desempate fica por conta do sistema de arquivos. Use um prefixo com segundo cheio.\n\n' +
    'Prefixo anterior ao de uma migration já executada não é mais problema: o migrator\n' +
    'roda com allowUnorderedMigrations (ver kysely.config.ts), então cada ambiente executa\n' +
    'o que falta sem exigir que a lista de arquivos seja prefixo exato do histórico.\n\n' +
    'Só reclamamos de arquivo novo: o que já foi aplicado em algum ambiente fica como está.\n';

function main(): void {
    const files: string[] = readdirSync(MIGRATIONS_DIR).filter((file: string) => file.endsWith('.ts'));
    const known: ReadonlySet<string> = alreadyOnMain();
    const found: Offence[] = offences(files).filter((offence: Offence) => offence.files.some((file: string) => !known.has(file)));
    reportOffences(found);
}

main();
