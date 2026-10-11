import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const schema = z.object({
    MAIL_DRIVER: z.enum(['smtp', 'ses']).default('smtp'),
    MAIL_FROM_EMAIL: z.string().email().default('no-reply@vera.example'),
    MAIL_FROM_NAME: z.string().default('Vera'),
    MAIL_CONFIGURATION_SET: z.string().default(''),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().default(1025),
    MAIL_ALLOWED_RECIPIENTS: z
        .string()
        .default('')
        .transform((raw: string) =>
            raw
                .split(',')
                .map((entry: string) => entry.trim().toLowerCase())
                .filter((entry: string) => entry.length > 0)
        )
});

export type MailConfig = z.infer<typeof schema>;

export const mailConfig = registerAs('mail', (): MailConfig => schema.parse(process.env));
