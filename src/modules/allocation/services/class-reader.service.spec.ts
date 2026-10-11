import { describe, expect, it, vi } from 'vitest';
import { makeClass } from '../../../../test/support/allocation-factories';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { AllocationLogService } from './allocation-log.service';
import { AllocationMetricsService } from './allocation-metrics.service';
import { ClassReaderService } from './class-reader.service';

function build(seeded: number): {
    service: ClassReaderService;
    defaultsSeeded: ReturnType<typeof vi.fn>;
    classAction: ReturnType<typeof vi.fn>;
} {
    const defaultsSeeded: ReturnType<typeof vi.fn> = vi.fn();
    const classAction: ReturnType<typeof vi.fn> = vi.fn();
    const domain: AssetClassDomain = {
        ensureDefaults: vi.fn().mockResolvedValue(Array.from({ length: seeded }, () => makeClass())),
        listActive: vi.fn().mockResolvedValue([makeClass()])
    } as unknown as AssetClassDomain;
    const service: ClassReaderService = new ClassReaderService(
        domain,
        { defaultsSeeded } as unknown as AllocationLogService,
        { classAction } as unknown as AllocationMetricsService
    );
    return { service, defaultsSeeded, classAction };
}

describe('ClassReaderService', () => {
    it('registra log e métrica quando semeia as classes padrão', async () => {
        const { service, defaultsSeeded, classAction } = build(8);

        await expect(service.listForCompany()).resolves.toHaveLength(1);

        expect(defaultsSeeded).toHaveBeenCalledWith(8);
        expect(classAction).toHaveBeenCalledWith('seeded', 8);
    });

    it('não registra nada quando as classes padrão já existiam', async () => {
        const { service, defaultsSeeded, classAction } = build(0);

        await service.listForCompany();

        expect(defaultsSeeded).not.toHaveBeenCalled();
        expect(classAction).not.toHaveBeenCalled();
    });
});
