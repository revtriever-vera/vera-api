import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().default(10)
});

export type DatabaseConfig = z.infer<typeof schema>;

export const databaseConfig = registerAs('database', (): DatabaseConfig => schema.parse(process.env));
