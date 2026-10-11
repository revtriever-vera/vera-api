import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { devOnlySecret } from '../../../shared/config/environment.schema';

const schema = z.object({
    CRYPTO_KEY_HEX: devOnlySecret('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 64).refine(
        (value: string) => /^[0-9a-f]{64}$/.test(value),
        'chave precisa ser 64 caracteres hex'
    )
});

export type CryptoConfig = z.infer<typeof schema>;

export const cryptoConfig = registerAs('crypto', (): CryptoConfig => schema.parse(process.env));
