import { z } from 'zod';

export const healthSchema = z.object({
    status: z.literal('ok').describe('Indicador estático de liveness')
});

export const readinessSchema = z.object({
    status: z.enum(['ok', 'degraded']).describe('Pronta para tráfego ou degradada'),
    checks: z
        .object({
            database: z.boolean().describe('Conexão com o Postgres respondendo')
        })
        .describe('Resultado de cada dependência verificada')
});
