import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const INFRA_DIR: string = __dirname;
const FIXTURES_DIR: string = join(INFRA_DIR, 'test');
const FORBIDDEN: readonly (readonly [string, RegExp])[] = [
    ['AWS account id', /\b\d{12}\b/],
    ['VPC id', /\bvpc-[0-9a-f]{8,}\b/],
    ['subnet id', /\bsubnet-[0-9a-f]{8,}\b/],
    ['security group id', /\bsg-[0-9a-f]{8,}\b/],
    ['literal ARN', /arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:(?!\$)[0-9a-z-]*:/],
    ['RDS endpoint', /\.rds\.amazonaws\.com/],
    ['ElastiCache endpoint', /\.cache\.amazonaws\.com/]
];

function filesUnder(directory: string): string[] {
    return readdirSync(directory).flatMap((entry: string): string[] => {
        const path: string = join(directory, entry);
        if (path === FIXTURES_DIR || entry === 'node_modules') {
            return [];
        }
        return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

describe('varredura de identificadores reais', () => {
    it.each(FORBIDDEN)('nenhum arquivo de infra/ contém %s', (_label: string, pattern: RegExp) => {
        const offenders: string[] = filesUnder(INFRA_DIR)
            .filter((file: string): boolean => file !== __filename && pattern.test(readFileSync(file, 'utf8')))
            .map((file: string): string => relative(INFRA_DIR, file));

        expect(offenders).toEqual([]);
    });
});
