import { describe, expect, it, vi } from 'vitest';
import { parseBillingConfig } from '../config/billing.config';
import { BillingDevPageNotFoundError } from '../domain/billing-engine.errors';
import { FakeBillingEngineDriver } from '../drivers/fake-billing-engine.driver';
import { BillingDevApplication } from './billing-dev.application';

function build(env: NodeJS.ProcessEnv): {
    application: BillingDevApplication;
    fake: { saveTestCard: ReturnType<typeof vi.fn>; payInvoice: ReturnType<typeof vi.fn> };
} {
    const fake = { saveTestCard: vi.fn(), payInvoice: vi.fn() };
    return { application: new BillingDevApplication(parseBillingConfig(env), fake as unknown as FakeBillingEngineDriver), fake };
}

describe('BillingDevApplication', () => {
    it('salva o cartão e volta para o app com card=saved', async () => {
        const { application, fake } = build({ IS_LOCAL: 'true' });
        fake.saveTestCard.mockResolvedValue('https://app.example.test/settings/plan?x=1');

        expect(await application.saveTestCard('tok')).toBe('https://app.example.test/settings/plan?x=1&card=saved');
    });

    it('token desconhecido ou expirado é 404', async () => {
        const { application, fake } = build({ IS_LOCAL: 'true' });
        fake.saveTestCard.mockResolvedValue(null);

        await expect(application.saveTestCard('tok')).rejects.toBeInstanceOf(BillingDevPageNotFoundError);
    });

    it('paga a fatura e recusa a desconhecida', async () => {
        const { application, fake } = build({ IS_LOCAL: 'true' });
        fake.payInvoice.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        await expect(application.payInvoice('inv')).resolves.toBeUndefined();
        await expect(application.payInvoice('nope')).rejects.toMatchObject({ code: 'billing.dev_page_not_found', status: 404 });
    });

    it('fora do local, ou com o driver revtriever, toda página de dev é 404 e nada é tocado', async () => {
        for (const env of [
            { IS_LOCAL: 'false', DEPLOYMENT_MODE: 'hosted', BILLING_ENGINE_DRIVER: 'fake' },
            { IS_LOCAL: 'true', BILLING_ENGINE_DRIVER: 'revtriever' }
        ]) {
            const { application, fake } = build(env);

            await expect(application.saveTestCard('tok')).rejects.toBeInstanceOf(BillingDevPageNotFoundError);
            await expect(application.payInvoice('inv')).rejects.toBeInstanceOf(BillingDevPageNotFoundError);
            expect(fake.saveTestCard).not.toHaveBeenCalled();
            expect(fake.payInvoice).not.toHaveBeenCalled();
        }
    });
});
