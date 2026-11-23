import { describe, expect, it, vi } from 'vitest';
import { ChannelHealthDomain } from '../domain/channel-health.domain';
import { TemplateRegistrationDomain } from '../domain/template-registration.domain';
import { RemoteTemplate, WhatsAppChannel } from '../domain/whatsapp.types';
import { WhatsAppCloudPort, WhatsAppGraphError } from '../ports/whatsapp-cloud.port';
import { WhatsAppChannelService } from '../services/whatsapp-channel.service';
import { WhatsAppHousekeepingService } from '../services/whatsapp-housekeeping.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppMetricsService } from '../services/whatsapp-metrics.service';
import { ChannelMaintenanceApplication } from './channel-maintenance.application';

function channelOf(overrides: Partial<WhatsAppChannel> = {}): WhatsAppChannel {
    return {
        phoneNumberId: 'phone-1',
        wabaId: 'waba-1',
        accessToken: 't',
        appSecret: 's',
        verifyToken: 'v',
        displayNumber: null,
        companyId: null,
        ...overrides
    };
}

function remote(language: string, status: RemoteTemplate['status'], reason: string | null = null): RemoteTemplate {
    return { name: 'vera_lembrete_v2', language, status, remoteId: `r-${language}`, rejectedReason: reason };
}

function build(channels: WhatsAppChannel[], port: Partial<WhatsAppCloudPort>, autoSubmit: boolean = true) {
    const save = vi.fn().mockResolvedValue(undefined);
    const health = { record: vi.fn().mockResolvedValue(undefined), markTokenInvalid: vi.fn().mockResolvedValue(undefined) };
    const logs = {
        channelSkipped: vi.fn(),
        templateStatus: vi.fn(),
        syncFailed: vi.fn(),
        tokenInvalid: vi.fn(),
        quality: vi.fn(),
        healthFailed: vi.fn()
    };
    const metrics = { quality: vi.fn(), lastWebhookAge: vi.fn() };
    const housekeeping = { purge: vi.fn().mockResolvedValue(undefined), lastWebhookAgeSeconds: vi.fn().mockResolvedValue(90) };
    const application: ChannelMaintenanceApplication = new ChannelMaintenanceApplication(
        {
            listAll: vi.fn().mockResolvedValue(channels),
            keyOf: (channel: WhatsAppChannel) => (channel.companyId === null ? 'hosted' : channel.phoneNumberId)
        } as unknown as WhatsAppChannelService,
        { save } as unknown as TemplateRegistrationDomain,
        health as unknown as ChannelHealthDomain,
        housekeeping as unknown as WhatsAppHousekeepingService,
        port as unknown as WhatsAppCloudPort,
        logs as unknown as WhatsAppLogService,
        metrics as unknown as WhatsAppMetricsService,
        { WHATSAPP_TEMPLATES_AUTO_SUBMIT: autoSubmit } as never
    );
    return { application, save, health, logs, metrics, housekeeping };
}

describe('ChannelMaintenanceApplication.syncTemplates', () => {
    it('traduz o status remoto: aprovado, em análise, recusado e pausado', async () => {
        const port = { listTemplates: vi.fn().mockResolvedValue([remote('pt_BR', 'APPROVED'), remote('en', 'REJECTED', 'INVALID')]) };
        const { application, save } = build([channelOf()], port);

        await application.syncTemplates();

        expect(save).toHaveBeenCalledWith(
            expect.objectContaining({ channelKey: 'hosted', language: 'pt_BR', status: 'approved', remoteId: 'r-pt_BR' })
        );
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', status: 'rejected', rejectedReason: 'INVALID' }));
    });

    it('PENDING e IN_APPEAL ficam submitted; PAUSED e DISABLED viram paused', async () => {
        const port = { listTemplates: vi.fn().mockResolvedValue([remote('pt_BR', 'IN_APPEAL'), remote('en', 'DISABLED')]) };
        const { application, save } = build([channelOf()], port);

        await application.syncTemplates();

        expect(save).toHaveBeenCalledWith(expect.objectContaining({ language: 'pt_BR', status: 'submitted' }));
        expect(save).toHaveBeenCalledWith(expect.objectContaining({ language: 'en', status: 'paused' }));
    });

    it('submete o que falta com a flag ligada e não submete com ela desligada', async () => {
        const submit = vi.fn().mockResolvedValue({ remoteId: 'new' });
        const on = build([channelOf()], { listTemplates: vi.fn().mockResolvedValue([]), submitTemplate: submit });
        const off = build([channelOf()], { listTemplates: vi.fn().mockResolvedValue([]), submitTemplate: submit }, false);

        await on.application.syncTemplates();
        expect(submit).toHaveBeenCalledTimes(2);
        expect(on.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitted', remoteId: 'new' }));

        submit.mockClear();
        await off.application.syncTemplates();
        expect(submit).not.toHaveBeenCalled();
    });

    it('pula o canal sem WABA e registra token inválido ou falha sem derrubar o resto', async () => {
        const noWaba = build([channelOf({ wabaId: null })], { listTemplates: vi.fn() });
        const token = build([channelOf()], {
            listTemplates: vi.fn().mockRejectedValue(new WhatsAppGraphError('token_invalid', '190', 401))
        });
        const down = build([channelOf()], { listTemplates: vi.fn().mockRejectedValue(new Error('x')) });

        await noWaba.application.syncTemplates();
        await token.application.syncTemplates();
        await down.application.syncTemplates();

        expect(noWaba.logs.channelSkipped).toHaveBeenCalledWith('waba_missing');
        expect(token.health.markTokenInvalid).toHaveBeenCalledWith('hosted');
        expect(down.logs.syncFailed).toHaveBeenCalledWith('hosted', 'unexpected');
    });
});

describe('ChannelMaintenanceApplication.checkHealth', () => {
    it('grava a saúde, alerta em YELLOW e publica a pior nota por grupo', async () => {
        const phoneHealth = vi
            .fn()
            .mockResolvedValueOnce({ qualityRating: 'GREEN', messagingLimitTier: 'T', status: 'CONNECTED' })
            .mockResolvedValueOnce({ qualityRating: 'YELLOW', messagingLimitTier: null, status: 'CONNECTED' });
        const { application, health, metrics, logs } = build(
            [channelOf({ companyId: 'a', phoneNumberId: 'p1' }), channelOf({ companyId: 'b', phoneNumberId: 'p2' })],
            { phoneHealth }
        );

        await application.checkHealth();

        expect(health.record).toHaveBeenCalledTimes(2);
        expect(logs.quality).toHaveBeenCalledWith('p2', 'YELLOW', null);
        expect(metrics.quality).toHaveBeenCalledWith('self_hosted', 'YELLOW');
        expect(metrics.lastWebhookAge).toHaveBeenCalledWith(90);
    });

    it('token recusado marca o canal; outra falha só registra', async () => {
        const token = build([channelOf()], { phoneHealth: vi.fn().mockRejectedValue(new WhatsAppGraphError('token_invalid', '190', 401)) });
        const other = build([channelOf()], { phoneHealth: vi.fn().mockRejectedValue(new WhatsAppGraphError('transient', '500', 500)) });

        await token.application.checkHealth();
        await other.application.checkHealth();

        expect(token.health.markTokenInvalid).toHaveBeenCalledWith('hosted');
        expect(other.logs.healthFailed).toHaveBeenCalledWith('hosted', '500');
        expect(other.metrics.quality).not.toHaveBeenCalled();
    });
});

describe('ChannelMaintenanceApplication.purge', () => {
    it('delega a retenção ao serviço', async () => {
        const { application, housekeeping } = build([], {});

        await application.purge();

        expect(housekeeping.purge).toHaveBeenCalledOnce();
    });
});
