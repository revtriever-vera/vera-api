import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PlatformBillingReaderService, PlatformBillingStatus } from '../../billing/services/platform-billing-reader.service';
import {
    getAccountToolShape,
    listAccountsToolShape,
    listAuditToolShape,
    SUMMARY_LAYERS
} from '../../platform-admin/services/platform-account-tool.schemas';
import { PlatformAccountsService } from '../../platform-admin/services/platform-accounts.service';
import { PlatformAuditService } from '../../platform-admin/services/platform-audit.service';
import { SignupLinksAdminService } from '../../signup-links/services/signup-links-admin.service';
import { defineTool, McpToolDefinition, READ_ONLY } from './mcp-tool';

const BILLING_STATUS_LIMIT: number = 25;
const ERROR_LENGTH: number = 300;

@Injectable()
export class PlatformReadToolsService {
    public constructor(
        private readonly accounts: PlatformAccountsService,
        private readonly audit: PlatformAuditService,
        private readonly links: SignupLinksAdminService,
        private readonly billing: PlatformBillingReaderService
    ) {}

    public definitions(): McpToolDefinition[] {
        return [this.overview(), this.listAccounts(), this.getAccount(), this.listSignupLinks(), this.listAudit(), this.billingStatus()];
    }

    private overview(): McpToolDefinition {
        return defineTool({
            name: 'overview',
            description:
                'Counts of customer accounts, plans, trials and past-due accounts, and the estimated monthly revenue. Metadata only.',
            shape: {},
            annotations: READ_ONLY,
            run: async () => this.accounts.overview()
        });
    }

    private listAccounts(): McpToolDefinition {
        return defineTool({
            name: 'list_accounts',
            description: 'Customer accounts, newest first, with an optional name search and pagination. Metadata only.',
            shape: listAccountsToolShape,
            annotations: READ_ONLY,
            run: async (args) => this.accounts.list(args)
        });
    }

    private getAccount(): McpToolDefinition {
        return defineTool({
            name: 'get_account',
            description:
                'Plan, subscription, invoices, offer, quota and people of one account. A reason is required: it is recorded as `account.viewed` ' +
                'and shown to the account owner. No financial data of the person (cards, credentials) is returned.',
            shape: getAccountToolShape,
            annotations: { ...READ_ONLY, idempotentHint: false },
            run: async (args) => this.accounts.access(args.accountId, { reason: args.reason, layers: SUMMARY_LAYERS })
        });
    }

    private listSignupLinks(): McpToolDefinition {
        return defineTool({
            name: 'list_signup_links',
            description: 'The most recent signup links, newest first, with status, redemptions, trials and subscriptions.',
            shape: {},
            annotations: READ_ONLY,
            run: async () => this.links.list()
        });
    }

    private listAudit(): McpToolDefinition {
        return defineTool({
            name: 'list_audit',
            description: 'The most recent platform audit entries, newest first, including the calls made through this server.',
            shape: listAuditToolShape,
            annotations: READ_ONLY,
            run: async (args) => ({ items: await this.audit.recent(args.limit) })
        });
    }

    private billingStatus(): McpToolDefinition {
        return defineTool({
            name: 'billing_status',
            description: 'Accounts past due, the overdue invoices and the latest events received from the billing engine (Revtriever).',
            shape: {
                limit: z.number().int().min(1).max(BILLING_STATUS_LIMIT).default(10).describe('How many invoices and events to return')
            },
            annotations: READ_ONLY,
            run: async (args) => this.billingOf(await this.billing.status(args.limit))
        });
    }

    private billingOf(status: PlatformBillingStatus): PlatformBillingStatus {
        return {
            ...status,
            recentEvents: status.recentEvents.map((event) => ({ ...event, error: event.error?.slice(0, ERROR_LENGTH) ?? null }))
        };
    }
}
