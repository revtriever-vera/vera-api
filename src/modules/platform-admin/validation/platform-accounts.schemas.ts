import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MAX_PAGE_SIZE: number = 100;
const DEFAULT_PAGE_SIZE: number = 25;
const MAX_SEARCH: number = 100;
export const MIN_REASON_LENGTH: number = 5;
export const MAX_REASON_LENGTH: number = 300;

export const ACCESS_LAYERS = { summary: 'summary', data: 'data' } as const;
export type AccessLayer = (typeof ACCESS_LAYERS)[keyof typeof ACCESS_LAYERS];

const planSchema = z
    .enum(['free', 'premium'])
    .describe('`premium` while a Premium contract line is open (a trial counts), otherwise `free`');

export const overviewSchema = z.object({
    accounts: z.object({
        total: z.number().int().describe('Customer accounts alive; the platform company is not counted'),
        createdLast30Days: z.number().int().describe('Accounts created in the last 30 days')
    }),
    plans: z.object({
        free: z.number().int().describe('Accounts without an open Premium line'),
        premium: z.number().int().describe('Accounts with an open Premium line, trials included'),
        trials: z.number().int().describe('Accounts whose open Premium line is a trial'),
        trialsWithCard: z.number().int().describe('Trials that started with a card on file (a subset of `trials`)'),
        trialsWithoutCard: z.number().int().describe('Trials that started without a card (a subset of `trials`)'),
        pastDue: z.number().int().describe('Accounts whose Premium has an overdue charge (`past_due` standing)')
    }),
    revenue: z.object({
        estimatedMonthlyCents: z
            .number()
            .int()
            .describe(
                'Estimated monthly revenue in cents: the Premium price of every account that has an open subscription line. Launch discounts and trials are not deducted'
            )
    })
});

export type OverviewView = z.infer<typeof overviewSchema>;

export const accountsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1).describe('Page number, starting at 1'),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Accounts per page'),
    search: z.string().trim().max(MAX_SEARCH).optional().describe('Part of the account name')
});

export class AccountsQueryDto extends createZodDto(accountsQuerySchema) {}

export const accountItemSchema = z.object({
    id: z.string().uuid().describe('Account id'),
    name: z.string().describe('Account name'),
    createdAt: z.string().datetime().describe('When the account was created'),
    plan: planSchema,
    planSource: z
        .string()
        .nullable()
        .describe('Source of the open Premium line (`subscription`, `trial`, `card_trial`, `manual`); null on Free'),
    trialEndsAt: z.string().datetime().nullable().describe('End of the trial, when the open line is one')
});

export type AccountItemView = z.infer<typeof accountItemSchema>;

export const accountListSchema = z.object({
    items: z.array(accountItemSchema).describe('Accounts, newest first. Metadata only: no customer data is opened here'),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int().describe('Accounts matching the search')
});

export type AccountListView = z.infer<typeof accountListSchema>;

export const accountIdParamsSchema = z.object({
    id: z.string().uuid().describe('Account id')
});

export class AccountIdParamsDto extends createZodDto(accountIdParamsSchema) {}

export const accessRequestSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(MIN_REASON_LENGTH)
        .max(MAX_REASON_LENGTH)
        .describe('Why the operator opens this account. Recorded in the audit trail and shown to the account owner'),
    layers: z
        .array(z.enum([ACCESS_LAYERS.summary, ACCESS_LAYERS.data]))
        .min(1)
        .max(2)
        .describe('`summary` for plan, subscription, offer, quota and people; `data` for the account data (read only)')
});

export class AccessRequestDto extends createZodDto(accessRequestSchema) {}

const memberSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    role: z.string(),
    joinedAt: z.string().datetime()
});

const isoSchema = z.string().datetime();

const billingSubscriptionSchema = z.object({
    id: z.string().uuid(),
    status: z.string().describe('`pending`, `active`, `failed` or `canceled`'),
    paymentMethod: z.enum(['card', 'pix']),
    paidThrough: isoSchema.nullable().describe('Until when the subscription is paid'),
    firstPaidAt: isoSchema.nullable().describe('When the first charge was paid'),
    canceledAt: isoSchema.nullable(),
    createdAt: isoSchema
});

const billingInvoiceSchema = z.object({
    id: z.string().uuid(),
    status: z.string().describe('`issued`, `overdue` or `paid`'),
    totalCents: z.number().int().nullable().describe('Invoice total in cents (BRL); null while not priced'),
    method: z.enum(['card', 'pix']).nullable(),
    dueDate: isoSchema.nullable(),
    cycleStart: isoSchema.nullable(),
    cycleEnd: isoSchema.nullable(),
    paidAt: isoSchema.nullable()
});

export const accountBillingSchema = z
    .object({
        subscriptions: z.array(billingSubscriptionSchema).describe('Every subscription of the account, card data left out'),
        invoices: z.array(billingInvoiceSchema).describe('The 100 most recent invoices')
    })
    .nullable()
    .describe('Subscriptions and invoices, without any card data');

export const accountOfferSchema = z
    .object({
        trial: z.object({
            kind: z
                .enum(['none', 'card', 'no_card'])
                .describe('`none`: no trial. `card`: trial with the card saved. `no_card`: trial without a card'),
            days: z.number().int().nullable().describe('Trial length in days; null when there is no trial')
        }),
        rules: z
            .array(
                z.object({
                    percent: z.number().int().describe('Discount on the Premium price, in percent'),
                    fromCycle: z.number().int().describe('First paid cycle the rule covers'),
                    toCycle: z.number().int().describe('Last paid cycle the rule covers, inclusive')
                })
            )
            .describe('Discount scale by paid cycle'),
        redeemedAt: isoSchema.describe('When the account redeemed the link'),
        expiresAt: isoSchema.describe('Until when the offer can still start'),
        source: z.string().describe('Where the redemption came from'),
        trialStartedAt: isoSchema.nullable(),
        appliedAt: isoSchema.nullable().describe('When the offer was applied to a subscription')
    })
    .nullable()
    .describe('Signup link offer the account redeemed; null when none');

export const accountUsageSchema = z
    .array(
        z.object({
            period: z.string().describe('Billing period, `YYYY-MM`'),
            feature: z.string().describe('`ai` or `whatsapp`'),
            costMicros: z.number().int().describe('Cost in millionths of a BRL (1_000_000 = R$ 1,00)'),
            entries: z.number().int().describe('Paid uses in the period')
        })
    )
    .nullable()
    .describe('Paid usage per period and feature');

export const accountSummarySchema = z.object({
    account: accountItemSchema,
    locale: z.string(),
    timezone: z.string(),
    people: z.array(memberSchema).describe('People of the account'),
    billing: accountBillingSchema,
    offer: accountOfferSchema,
    usage: accountUsageSchema
});

export type AccountSummaryView = z.infer<typeof accountSummarySchema>;

const minorSchema = (what: string): z.ZodNumber => z.number().int().describe(`${what}, in cents (minor units)`);

const positionSchema = z.object({
    symbol: z.string().nullable(),
    name: z.string().nullable(),
    quantity: z.string().describe('Decimal quantity, as text'),
    averagePrice: z.string().nullable().describe('Decimal average price, as text'),
    classId: z.string().uuid().nullable(),
    holderUserId: z.string().uuid().nullable(),
    createdAt: isoSchema
});

const fixedIncomeTitleSchema = z.object({
    id: z.string().uuid(),
    kind: z.string(),
    name: z.string(),
    issuerId: z.string().nullable(),
    holderUserId: z.string().uuid().nullable(),
    indexer: z.string(),
    rateBps: z.number().int().describe('Rate in basis points'),
    currency: z.string(),
    appliedMinor: minorSchema('Amount applied'),
    appliedAt: z.string().describe('Date of the application, `YYYY-MM-DD`'),
    maturityDate: z.string().describe('Maturity date, `YYYY-MM-DD`'),
    taxRegime: z.string(),
    createdAt: isoSchema
});

const allocationSchema = z.object({
    settings: z.object({ baseCurrency: z.string(), toleranceBps: z.number().int().describe('Rebalance tolerance in basis points') }),
    classes: z.array(
        z.object({
            id: z.string().uuid(),
            systemKey: z.string().nullable(),
            aliasKeys: z.array(z.string()),
            name: z.string().nullable(),
            colorKey: z.string(),
            targetBps: z.number().int().describe('Target share of the portfolio in basis points'),
            sortOrder: z.number().int(),
            createdAt: isoSchema
        })
    ),
    assetTargets: z.array(
        z.object({
            subjectType: z.string(),
            subjectId: z.string(),
            classId: z.string().uuid(),
            targetInClassBps: z.number().int().describe('Target share inside the class in basis points')
        })
    )
});

const goalsSchema = z.object({
    goals: z.array(
        z.object({
            id: z.string().uuid(),
            kind: z.string(),
            name: z.string(),
            targetMinor: minorSchema('Target amount'),
            targetDate: z.string().describe('Target date, `YYYY-MM-DD`'),
            holderUserId: z.string().uuid().nullable(),
            manualMinor: minorSchema('Amount saved by hand'),
            reserveMonths: z.number().int().nullable().describe('Months of expenses of an emergency reserve goal'),
            createdAt: isoSchema
        })
    ),
    goalHoldings: z.array(
        z.object({
            goalId: z.string().uuid(),
            holdingKind: z.string(),
            holdingId: z.string(),
            shareBps: z.number().int().describe('Share of the holding given to the goal, in basis points')
        })
    )
});

const transactionsSchema = z.object({
    accounts: z.array(
        z.object({
            name: z.string(),
            kind: z.string(),
            institutionName: z.string().nullable(),
            numberLast4: z.string().nullable(),
            currency: z.string(),
            source: z.enum(['pluggy', 'file'])
        })
    ),
    transactions: z.array(
        z.object({
            date: z.string().describe('`YYYY-MM-DD`'),
            amountMinor: minorSchema('Signed amount'),
            currency: z.string(),
            description: z.string(),
            counterpartyName: z.string().nullable(),
            category: z.string().nullable(),
            categorySource: z.string(),
            account: z.string().describe('Name of the financial account'),
            source: z.string(),
            installment: z.object({ number: z.number().int(), total: z.number().int() }).nullable()
        })
    ),
    imports: z.array(
        z.object({
            format: z.string(),
            fileName: z.string(),
            rows: z.number().int(),
            inserted: z.number().int(),
            duplicates: z.number().int(),
            createdAt: isoSchema,
            status: z.string()
        })
    )
});

const spendingCategoriesSchema = z.object({
    categories: z.array(
        z.object({
            systemKey: z.string().nullable(),
            name: z.string().nullable(),
            kind: z.string(),
            flexibility: z.string().nullable(),
            icon: z.string()
        })
    ),
    rules: z.array(
        z.object({
            matchType: z.string(),
            pattern: z.string().nullable(),
            label: z.string(),
            appliesTo: z.string(),
            categoryKey: z.string().nullable()
        })
    )
});

const spendingSettingsDataSchema = z
    .object({
        savingsGoalBps: z.number().int().describe('Savings goal in basis points of the income'),
        incomeMode: z.string().describe('`transactions` or `declared`'),
        declaredIncomeMinor: minorSchema('Monthly income declared').nullable()
    })
    .nullable();

const recurringSchema = z.object({
    series: z.array(
        z.object({
            name: z.string(),
            merchantKey: z.string(),
            account: z.string(),
            kind: z.string(),
            cadence: z.string(),
            valueMode: z.string(),
            status: z.string(),
            origin: z.string(),
            typicalAmountMinor: minorSchema('Typical charge'),
            minAmountMinor: minorSchema('Smallest charge'),
            maxAmountMinor: minorSchema('Largest charge'),
            expectedDay: z.number().int().nullable(),
            firstDate: z.string().describe('`YYYY-MM-DD`'),
            lastDate: z.string().describe('`YYYY-MM-DD`'),
            snoozedUntil: z.string().nullable().describe('`YYYY-MM-DD`'),
            confirmedAt: isoSchema.nullable(),
            dismissedAt: isoSchema.nullable(),
            stoppedAt: isoSchema.nullable(),
            stoppedBy: z.string().nullable(),
            charges: z.array(z.object({ date: z.string().describe('`YYYY-MM-DD`'), amountMinor: minorSchema('Charge'), role: z.string() }))
        })
    ),
    suppressions: z.array(z.object({ merchantKey: z.string(), typicalAmountMinor: minorSchema('Typical charge'), createdAt: isoSchema })),
    alerts: z.array(
        z.object({
            series: z.string().describe('Name of the series'),
            kind: z.string(),
            occurredOn: z.string().describe('`YYYY-MM-DD`'),
            seen: z.boolean(),
            data: z.record(z.string(), z.union([z.string(), z.number()]))
        })
    )
});

const bankConnectionsSchema = z.object({
    connections: z.array(
        z.object({
            connectorName: z.string().nullable(),
            status: z.string(),
            createdAt: isoSchema,
            lastSuccessAt: isoSchema.nullable()
        })
    )
});

export const accountDataSchema = z
    .object({
        positions: z.array(positionSchema),
        fixed_income: z.object({ titles: z.array(fixedIncomeTitleSchema) }),
        allocation: allocationSchema,
        goals: goalsSchema,
        transactions: transactionsSchema,
        spending_categories: spendingCategoriesSchema,
        spending_settings: spendingSettingsDataSchema,
        recurring: recurringSchema,
        bank_connections: bankConnectionsSchema
    })
    .describe(
        'Present when the `data` layer was asked: one entry per area. Money is in cents. Keys, credentials, tokens, hints and WhatsApp conversations never appear'
    );

export type AccountDataView = z.infer<typeof accountDataSchema>;

export const accessResponseSchema = z.object({
    accountId: z.string().uuid(),
    summary: accountSummarySchema.optional().describe('Present when the `summary` layer was asked'),
    data: accountDataSchema.optional()
});

export type AccessResponseView = z.infer<typeof accessResponseSchema>;

export const supportAccessItemSchema = z.object({
    id: z.string().uuid(),
    at: z.string().datetime().describe('When the account was opened'),
    operatorName: z.string().nullable().describe('Name of the operator; null when that person no longer exists'),
    reason: z.string().describe('Reason the operator gave'),
    layers: z.array(z.string()).describe('Which layers were opened')
});

export const supportAccessListSchema = z.object({
    items: z.array(supportAccessItemSchema).describe('Most recent first')
});

export type SupportAccessListView = z.infer<typeof supportAccessListSchema>;
