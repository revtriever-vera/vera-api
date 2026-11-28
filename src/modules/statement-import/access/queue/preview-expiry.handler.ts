import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { ImportPreviewApplication } from '../../application/import-preview.application';
import { previewExpiredPayloadSchema } from '../../validation/statement-import.schemas';

@Injectable()
export class StatementPreviewRemoverHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.statementImport;
    public readonly type: string = MESSAGE_TYPES.statementImportPreviewExpired;

    public constructor(private readonly application: ImportPreviewApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof previewExpiredPayloadSchema.safeParse> = previewExpiredPayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.expire(parsed.data.previewId);
        }
    }
}
