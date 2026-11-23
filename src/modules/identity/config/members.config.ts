import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
    APP_URL: z.string().url().default('http://localhost:5173'),
    INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
    MEMBERS_MAX_PER_ACCOUNT: z.coerce.number().int().positive().default(10)
});

export type MembersConfig = z.infer<typeof schema>;

export const membersConfig = registerAs('members', (): MembersConfig => schema.parse(process.env));
