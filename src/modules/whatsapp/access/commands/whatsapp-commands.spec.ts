import { describe, expect, it, vi } from 'vitest';
import { QueueEnvelope } from '../../../../core/queue/queue.types';
import { ChannelMaintenanceApplication } from '../../application/channel-maintenance.application';
import { HealthCommand, HealthTickHandler } from './health.command';
import { RetentionCommand, RetentionTickHandler } from './retention.command';
import { TemplatesSyncCommand, TemplatesSyncTickHandler } from './templates-sync.command';

describe('commands do WhatsApp', () => {
    it('declaram chave, fila, tipo e cron', () => {
        expect(
            [new TemplatesSyncCommand(), new HealthCommand(), new RetentionCommand()].map((command) => [
                command.key,
                command.queue,
                command.type,
                command.pattern
            ])
        ).toEqual([
            ['whatsapp-templates-sync-command', 'vera-whatsapp', 'whatsapp.templates.sync.requested', '0 * * * *'],
            ['whatsapp-health-command', 'vera-whatsapp', 'whatsapp.health.requested', '0 */6 * * *'],
            ['whatsapp-retention-command', 'vera-whatsapp', 'whatsapp.retention.requested', '0 4 * * *']
        ]);
    });

    it('cada tick chama a rotina certa', async () => {
        const syncTemplates = vi.fn().mockResolvedValue(undefined);
        const checkHealth = vi.fn().mockResolvedValue(undefined);
        const purge = vi.fn().mockResolvedValue(undefined);
        const application = { syncTemplates, checkHealth, purge } as unknown as ChannelMaintenanceApplication;

        await new TemplatesSyncTickHandler(application).handle({} as QueueEnvelope);
        await new HealthTickHandler(application).handle({} as QueueEnvelope);
        await new RetentionTickHandler(application).handle({} as QueueEnvelope);

        expect([syncTemplates, checkHealth, purge].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
    });
});
