import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BillingReplayService, ReconcileResult } from '../../billing/services/billing-replay.service';
import {
    createSignupLinkToolShape,
    signupLinkIdToolShape,
    updateSignupLinkToolShape
} from '../../signup-links/services/signup-link-tool.schemas';
import { SignupLinksAdminService } from '../../signup-links/services/signup-links-admin.service';
import { PlatformMcpInvalidWindowError } from '../domain/platform-mcp.errors';
import { defineTool, McpToolDefinition } from './mcp-tool';

const REPLAY_MAX_DAYS: number = 7;
const MS_PER_DAY: number = 86_400_000;

@Injectable()
export class PlatformWriteToolsService {
    public constructor(
        private readonly links: SignupLinksAdminService,
        private readonly replays: BillingReplayService
    ) {}

    public definitions(): McpToolDefinition[] {
        return [this.createLink(), this.updateLink(), this.disableLink(), this.reconcile(), this.replayEvents()];
    }

    private createLink(): McpToolDefinition {
        return defineTool({
            name: 'create_signup_link',
            description:
                'Creates a signup link with its offer (trial, discount scale, limit, validity). Not idempotent: each call creates another link.',
            shape: createSignupLinkToolShape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
            run: async (args) => this.links.create(args)
        });
    }

    private updateLink(): McpToolDefinition {
        return defineTool({
            name: 'update_signup_link',
            description:
                'Changes the offer of a signup link; omitted fields stay. Applies to new redemptions and to redeemed offers not applied yet. Fails on a revoked link.',
            shape: updateSignupLinkToolShape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            run: async ({ id, ...patch }) => this.links.update(id, patch)
        });
    }

    private disableLink(): McpToolDefinition {
        return defineTool({
            name: 'disable_signup_link',
            description:
                'Revokes a signup link: it stops accepting redemptions for good. Who already redeemed keeps the offer. Revoking twice changes nothing.',
            shape: signupLinkIdToolShape,
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
            run: async (args) => {
                await this.links.revoke(args.id);
                return { revoked: true, id: args.id };
            }
        });
    }

    private reconcile(): McpToolDefinition {
        return defineTool({
            name: 'billing_reconcile',
            description:
                'Runs the billing reconciliation now: compares the open invoices and those of the recent window with the Revtriever and applies the differences. Safe to repeat.',
            shape: {},
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            run: async (): Promise<ReconcileResult> => this.replays.reconcile()
        });
    }

    private replayEvents(): McpToolDefinition {
        return defineTool({
            name: 'billing_replay_events',
            description:
                'Republishes the billing events received but not processed within a window (at most 7 days), so they are processed again. Safe to repeat: processed events are skipped.',
            shape: {
                from: z.string().datetime().describe('Start of the window, ISO 8601'),
                to: z.string().datetime().describe('End of the window, ISO 8601')
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
            run: async (args) => this.replayWindow(new Date(args.from), new Date(args.to))
        });
    }

    private async replayWindow(from: Date, to: Date): Promise<{ republished: number }> {
        if (to.getTime() < from.getTime() || to.getTime() - from.getTime() > REPLAY_MAX_DAYS * MS_PER_DAY) {
            throw new PlatformMcpInvalidWindowError();
        }
        return { republished: await this.replays.replayWindow(from, to) };
    }
}
