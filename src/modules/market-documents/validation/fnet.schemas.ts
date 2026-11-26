import { z } from 'zod';

export const fnetListSchema = z.object({
    data: z.array(
        z.object({
            id: z.coerce.number().int().positive(),
            versao: z.coerce.number().int().nonnegative().default(0),
            status: z.string().default(''),
            tipoDocumento: z.string().default(''),
            categoriaDocumento: z.string().default(''),
            dataEntrega: z.string().default('')
        })
    )
});

export type FnetDocumentItem = z.infer<typeof fnetListSchema>['data'][number];

const DELIVERY_PATTERN: RegExp = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/;

export function deliveryInstant(raw: string): string | null {
    const match: RegExpExecArray | null = DELIVERY_PATTERN.exec(raw.trim());
    if (match === null) {
        return null;
    }
    return `${match[3] ?? ''}-${match[2] ?? ''}-${match[1] ?? ''}T${match[4] ?? '12'}:${match[5] ?? '00'}:00-03:00`;
}
