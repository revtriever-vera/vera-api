import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const TARGET: string = '.env';
const EXAMPLE: string = '.env.example';

function main(): void {
    if (!existsSync(EXAMPLE)) {
        throw new Error('.env.example não encontrado');
    }
    if (existsSync(TARGET)) {
        console.log('.env já existe — nada a fazer (apague para regerar)');
        return;
    }
    writeFileSync(TARGET, readFileSync(EXAMPLE, 'utf8'));
    console.log('.env gerado a partir do .env.example (segredos reais vêm do SSM em dev/prod)');
}

main();
