import { z } from 'zod';

export const sendResponseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1) })).min(1) });

export const templatesResponseSchema = z.object({
    data: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            language: z.string(),
            status: z.string(),
            rejected_reason: z.string().optional()
        })
    ),
    paging: z.object({ next: z.string().optional() }).optional()
});

export const submitResponseSchema = z.object({ id: z.string().min(1) });

export const healthResponseSchema = z.object({
    quality_rating: z.string().optional(),
    messaging_limit_tier: z.string().optional(),
    status: z.string().optional()
});

export const displayNumberResponseSchema = z.object({ display_phone_number: z.string().optional() });

export const successSchema = z.object({ success: z.boolean().optional() });

export type DisplayNumberResponse = z.infer<typeof displayNumberResponseSchema>;
export type SendResponse = z.infer<typeof sendResponseSchema>;
export type TemplatesResponse = z.infer<typeof templatesResponseSchema>;
export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type TemplateEntry = TemplatesResponse['data'][number];
