import { z } from 'zod';

export const fnetListSchema = z.object({
    data: z.array(
        z.object({
            id: z.coerce.number().int().positive(),
            versao: z.coerce.number().int().nonnegative().default(0),
            status: z.string(),
            tipoDocumento: z.string()
        })
    )
});

export type FnetListItem = z.infer<typeof fnetListSchema>['data'][number];

export const fnetDocumentSchema = z.string().min(1);

const DATE_PATTERN: RegExp = /^(?:(\d{4}-\d{2}-\d{2})|(\d{2})\/(\d{2})\/(\d{4}))$/;

export function normalizedDate(raw: string): string | null {
    const match: RegExpExecArray | null = DATE_PATTERN.exec(raw.trim());
    if (match === null) {
        return null;
    }
    return match[1] ?? `${match[4] ?? ''}-${match[3] ?? ''}-${match[2] ?? ''}`;
}

export const fnetProventoSchema = z.object({
    tipo: z.string().min(1),
    dataBase: z
        .string()
        .transform((raw: string): string | null => normalizedDate(raw))
        .pipe(z.string()),
    dataPagamento: z
        .string()
        .nullable()
        .transform((raw: string | null): string | null => (raw === null ? null : normalizedDate(raw))),
    valor: z
        .string()
        .transform((raw: string): string => raw.trim().replace(',', '.'))
        .pipe(z.string().regex(/^\d+(\.\d+)?$/))
});

export type FnetProvento = z.infer<typeof fnetProventoSchema>;
