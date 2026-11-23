import { loadEnvFile } from 'node:process';
import { billingCatalogFactory } from '../src/modules/billing/drivers/billing-engine.factory';
import { BillingSettings, parseBillingConfig } from '../src/modules/billing/config/billing.config';
import { ProvisionResult, provisionCatalog } from '../src/modules/billing/services/billing-catalog-provisioner';

function loadEnv(): void {
    try {
        loadEnvFile();
    } catch {
        void 0;
    }
}

function planLine(result: ProvisionResult): string {
    if (result.createdPlan) {
        return 'criado';
    }
    return result.publishedVersion ? 'versão nova publicada' : 'já existia';
}

async function main(): Promise<void> {
    loadEnv();
    const settings: BillingSettings = parseBillingConfig(process.env);
    const result: ProvisionResult = await provisionCatalog(billingCatalogFactory(settings), {
        priceEndpointUrl: settings.BILLING_PRICE_ENDPOINT_URL,
        priceCeilingCents: settings.BILLING_PRICE_CEILING_CENTS
    });
    console.log(`driver: ${settings.BILLING_ENGINE_DRIVER}`);
    console.log(`produto: ${result.createdProduct ? 'criado' : 'já existia'}`);
    console.log(`plano: ${planLine(result)}`);
    console.log(`REVTRIEVER_PLAN_ID=${result.planId}`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
