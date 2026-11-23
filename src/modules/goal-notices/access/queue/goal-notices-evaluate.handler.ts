import { Injectable } from '@nestjs/common';
import { QueueEnvelope, QueueHandlerPort } from '../../../../core/queue/queue.types';
import { MESSAGE_TYPES, QUEUES, QueueName } from '../../../../shared/constants/queues.constants';
import { GoalNoticesApplication } from '../../application/goal-notices.application';
import { evaluatePayloadSchema } from '../../validation/goal-notices.schemas';

@Injectable()
export class GoalNoticesEvaluateHandler extends QueueHandlerPort {
    public readonly queue: QueueName = QUEUES.goalNotices;
    public readonly type: string = MESSAGE_TYPES.goalNoticesEvaluateRequested;

    public constructor(private readonly application: GoalNoticesApplication) {
        super();
    }

    public async handle(envelope: QueueEnvelope): Promise<void> {
        const parsed: ReturnType<typeof evaluatePayloadSchema.safeParse> = evaluatePayloadSchema.safeParse(envelope.payload);
        if (parsed.success) {
            await this.application.evaluate(parsed.data.companyId);
        }
    }
}
