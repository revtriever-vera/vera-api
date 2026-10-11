import { Injectable } from '@nestjs/common';
import { UnknownSystemKeyError } from '../domain/allocation.errors';
import { AssetClass } from '../domain/allocation.types';
import { ClassReaderService } from './class-reader.service';

type KeyEntry = [string, AssetClass];

@Injectable()
export class ClassResolverService {
    public constructor(private readonly reader: ClassReaderService) {}

    public async resolveBySystemKey(systemKey: string): Promise<AssetClass> {
        const classes: readonly AssetClass[] = await this.reader.listForCompany();
        const aliases: KeyEntry[] = classes.flatMap((item: AssetClass) => item.aliasKeys.map((key: string): KeyEntry => [key, item]));
        const owned: KeyEntry[] = classes.flatMap((item: AssetClass): KeyEntry[] =>
            item.systemKey === null ? [] : [[item.systemKey, item]]
        );
        const resolved: AssetClass | undefined = new Map<string, AssetClass>([...aliases, ...owned]).get(systemKey);
        if (resolved === undefined) {
            throw new UnknownSystemKeyError(systemKey);
        }
        return resolved;
    }
}
