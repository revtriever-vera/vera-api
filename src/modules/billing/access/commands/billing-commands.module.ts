import { Module } from '@nestjs/common';
import { BillingApplicationModule } from '../../application/billing-application.module';
import { BillingEventsReplayCommand, BillingEventsReplayTickHandler } from './billing-events-replay.command';
import { BillingInvoicesReconcileCommand, BillingInvoicesReconcileTickHandler } from './billing-invoices-reconcile.command';
import { BillingProvisioningRescueCommand, BillingProvisioningRescueTickHandler } from './billing-provisioning-rescue.command';
import { BillingStandingSweepCommand, BillingStandingSweepTickHandler } from './billing-standing-sweep.command';

@Module({
    imports: [BillingApplicationModule],
    providers: [
        BillingProvisioningRescueCommand,
        BillingProvisioningRescueTickHandler,
        BillingEventsReplayCommand,
        BillingEventsReplayTickHandler,
        BillingInvoicesReconcileCommand,
        BillingInvoicesReconcileTickHandler,
        BillingStandingSweepCommand,
        BillingStandingSweepTickHandler
    ]
})
export class BillingCommandsModule {}
