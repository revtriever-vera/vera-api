import { z } from 'zod';

export const snapshotPayloadSchema = z.object({ companyId: z.string().uuid() });

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
