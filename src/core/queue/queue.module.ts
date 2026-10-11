import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ContextModule } from '../context/context.module';
import { DatabaseModule } from '../database/database.module';
import { ObservabilityModule } from '../observability/observability.module';
import { BullQueuePublisher } from './bull-queue.publisher';
import { BullWorkerService } from './bull-worker.service';
import { CommandReconcilerService } from './command-reconciler.service';
import { QueueLogService } from './queue-log.service';
import { QueueTelemetryService } from './queue-telemetry.service';
import { QueuePublisherPort } from './queue.types';
import { RedisConnection } from './redis.connection';

@Module({
    imports: [DiscoveryModule, ContextModule, DatabaseModule, ObservabilityModule],
    providers: [
        RedisConnection,
        { provide: QueuePublisherPort, useClass: BullQueuePublisher },
        BullWorkerService,
        CommandReconcilerService,
        QueueTelemetryService,
        QueueLogService
    ],
    exports: [QueuePublisherPort, RedisConnection]
})
export class QueueModule {}
