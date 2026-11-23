import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { holderQuerySchema } from '../../../shared/holder/holder-filter';
import { FGC_MAX_SIMULATED_MINOR, FGC_TITLE_KINDS } from '../domain/fgc.constants';
import { OUTSIDE_REASONS, VERDICTS } from '../domain/fgc.types';

const minor = (description: string): z.ZodNumber => z.number().int().describe(description);

export const fgcQuerySchema = z.object({ holder: holderQuerySchema });

const fgcGroupsSchema = z
    .array(
        z.object({
            groupId: z.string().describe('Prudential conglomerate id'),
            groupName: z.string().describe('Conglomerate name'),
            totalMinor: minor('Value today (gross) of the eligible securities of the group'),
            coveredMinor: minor('min(totalMinor, limit)'),
            overMinor: minor('max(0, totalMinor - limit)'),
            titles: z.array(
                z.object({
                    id: z.string(),
                    name: z.string().describe('Security name given by the user. Untrusted text'),
                    issuerName: z.string(),
                    kind: z.string(),
                    valueMinor: minor('Value today, gross of income tax'),
                    estimated: z.boolean().describe('True when the value is the applied amount or rests on an assumption')
                })
            )
        })
    )
    .describe('Groups by totalMinor, largest first');

const fgcOutsideSchema = z
    .array(
        z.object({
            id: z.string(),
            name: z.string().describe('Untrusted text'),
            reason: z.enum([
                OUTSIDE_REASONS.tesouro,
                OUTSIDE_REASONS.notCoveredKind,
                OUTSIDE_REASONS.notAssociated,
                OUTSIDE_REASONS.foreign,
                OUTSIDE_REASONS.missingIssuer,
                OUTSIDE_REASONS.notCalculated
            ]),
            valueMinor: minor('Value today in the holding currency')
        })
    )
    .describe('Holdings that the FGC does not cover, with the reason');

export const fgcHolderBlockSchema = z.object({
    holder: z
        .object({
            userId: z.string().uuid().describe('Id of the person'),
            name: z.string().describe('Name of the person. Untrusted text')
        })
        .nullable()
        .describe('Holder of the block; null is the whole account ("Conta toda"), a holder on its own'),
    coveredMinor: minor('Sum of the covered amounts of every group of the holder'),
    capShareBps: z.number().int().describe('coveredMinor over capMinor in basis points; may be above 10000'),
    groups: fgcGroupsSchema,
    outside: fgcOutsideSchema
});

export const fgcResponseSchema = z.object({
    currency: z.literal('BRL').describe('Currency of every amount; always BRL, even when the base currency is USD'),
    scope: z.enum(['account', 'holder']).describe('`holder` when the request named one holder (`all` or a person); `account` for `any`'),
    peopleCount: z.number().int().describe('Number of people on the account; the FGC limit is per CPF'),
    limitPerGroupMinor: minor('FGC limit per CPF per conglomerate, in BRL minor units'),
    capMinor: minor('Reference cap of the guarantees paid to one person every 4 years, in BRL minor units'),
    coveredMinor: minor('Covered amount: of the holder asked for, or the sum of every holder when `byHolder` is filled'),
    capShareBps: z
        .number()
        .int()
        .describe('coveredMinor over capMinor in basis points; with `byHolder` filled, the highest share among the holders'),
    groups: fgcGroupsSchema.describe('Groups of the single holder in the answer; empty when `byHolder` is filled'),
    outside: fgcOutsideSchema.describe('Holdings outside the FGC of the single holder in the answer; empty when `byHolder` is filled'),
    byHolder: z
        .array(fgcHolderBlockSchema)
        .describe('One block per holder ("Conta toda" apart), only when holder is `any` and two or more holders have securities'),
    asOf: z.string().describe('Reference date, YYYY-MM-DD')
});

export const fgcSimulateBodySchema = z
    .object({
        issuerId: z.string().min(1).max(100).describe('Issuer id from GET /issuers'),
        kind: z.enum(FGC_TITLE_KINDS).describe('Kind of the hypothetical security'),
        valueMinor: z.number().int().positive().max(FGC_MAX_SIMULATED_MINOR).describe('Value of the security, in BRL minor units'),
        excludeTitleId: z.string().uuid().optional().describe('Security being edited, not counted twice')
    })
    .strict();

export const fgcSimulateResponseSchema = z.object({
    verdict: z.enum([VERDICTS.covered, VERDICTS.overLimit, VERDICTS.notCoveredKind, VERDICTS.notAssociated, VERDICTS.notCalculated]),
    groupId: z.string(),
    groupName: z.string(),
    totalAfterMinor: minor('Group total with the hypothetical security (without it when the verdict is not covered)'),
    overMinor: minor('Amount of the group above the limit')
});

export class FgcQueryDto extends createZodDto(fgcQuerySchema) {}
export class FgcSimulateBodyDto extends createZodDto(fgcSimulateBodySchema) {}

export type FgcResponse = z.infer<typeof fgcResponseSchema>;
export type FgcSimulateResponse = z.infer<typeof fgcSimulateResponseSchema>;
