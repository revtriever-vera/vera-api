import { z } from 'zod';
import { PositionSnapshotEntry } from '../domain/investment-operations.types';

export const positionSnapshotsSchema: z.ZodType<PositionSnapshotEntry[]> = z.array(
    z.object({
        assetId: z.string(),
        holderUserId: z.string().nullable(),
        state: z.object({ quantity: z.string(), averagePrice: z.string().nullable(), classId: z.string() }).nullable()
    })
);
