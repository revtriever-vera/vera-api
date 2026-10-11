import { Injectable } from '@nestjs/common';
import { APP_LOCALES, AppLocale } from '../../../shared/i18n/locale';
import { AssetClass } from '../domain/allocation.types';
import { DEFAULT_CLASS_NAMES, isSystemClassKey } from '../domain/default-class-names';

@Injectable()
export class ClassDisplayNameService {
    public nameOf(assetClass: AssetClass, locale: AppLocale): string {
        return assetClass.name ?? this.defaultNameOf(assetClass, locale);
    }

    public takenNamesOf(assetClass: AssetClass): string[] {
        const names: readonly string[] = assetClass.name === null ? this.allDefaultNamesOf(assetClass) : [assetClass.name];
        return names.map((name: string) => name.toLowerCase());
    }

    private defaultNameOf(assetClass: AssetClass, locale: AppLocale): string {
        const systemKey: string | null = assetClass.systemKey;
        return systemKey !== null && isSystemClassKey(systemKey) ? DEFAULT_CLASS_NAMES[systemKey][locale] : '';
    }

    private allDefaultNamesOf(assetClass: AssetClass): string[] {
        return APP_LOCALES.map((locale: AppLocale) => this.defaultNameOf(assetClass, locale)).filter((name: string) => name !== '');
    }
}
