import { z } from 'zod';

export const debugTokenSchema = z.object({
    data: z.object({
        is_valid: z.boolean().optional(),
        app_id: z.string().optional(),
        type: z.string().optional(),
        user_id: z.string().optional()
    })
});

export const profileSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().optional()
});

export const graphErrorSchema = z.object({ error: z.object({ code: z.number().optional() }) });

export type DebugTokenResponse = z.infer<typeof debugTokenSchema>;
export type ProfileResponse = z.infer<typeof profileSchema>;
export type GraphErrorResponse = z.infer<typeof graphErrorSchema>;
