import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { proveSecondFactor } from './second-factor.proof';

const SRC: string = join(__dirname, '../../..');
const ALLOWED: readonly string[] = [
    'modules/identity/application/admin-totp.application.ts',
    'modules/identity/domain/second-factor.proof.ts'
];

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((entry: string): string[] => {
        const path: string = join(dir, entry);
        if (statSync(path).isDirectory()) {
            return sources(path);
        }
        return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
}

describe('prova do segundo fator', () => {
    it('carrega o usuário e o método', () => {
        expect(proveSecondFactor('user-1', 'recovery_code')).toEqual({ userId: 'user-1', method: 'recovery_code' });
    });

    it('só a aplicação do TOTP fabrica a prova que abre a sessão com o claim platform', () => {
        const makers: string[] = sources(SRC)
            .filter((file: string): boolean => readFileSync(file, 'utf8').includes('proveSecondFactor('))
            .map((file: string): string => relative(SRC, file));

        expect(makers.sort()).toEqual([...ALLOWED].sort());
    });

    it('só a aplicação do TOTP chama issueForPlatform', () => {
        const callers: string[] = sources(SRC)
            .filter((file: string): boolean => readFileSync(file, 'utf8').includes('.issueForPlatform('))
            .map((file: string): string => relative(SRC, file));

        expect(callers).toEqual(['modules/identity/application/admin-totp.application.ts']);
    });
});
