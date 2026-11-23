import { AppLocale } from '../../../../shared/i18n/locale';
import { moneyText, percentText, pointsText, signedPercentText } from './money-text';

const MINOR_PER_MAJOR: number = 100;
const BPS_PER_PERCENT: number = 100;

export class ContextFacts {
    private readonly cited: Set<number> = new Set<number>();

    public constructor(
        private readonly locale: AppLocale,
        private readonly currency: string
    ) {}

    public money(minor: number): string {
        this.cited.add(Math.abs(Math.round(minor / MINOR_PER_MAJOR)));
        return moneyText(minor, this.currency, this.locale);
    }

    public moneyOrNull(minor: number | null): string | null {
        return minor === null ? null : this.money(minor);
    }

    public percent(bps: number): string {
        this.cited.add(Math.abs(Math.round(bps / BPS_PER_PERCENT)));
        return percentText(bps, this.locale);
    }

    public percentOrNull(bps: number | null): string | null {
        return bps === null ? null : this.percent(bps);
    }

    public signedPercentOrNull(bps: number | null): string | null {
        if (bps === null) {
            return null;
        }
        this.cited.add(Math.abs(Math.round(bps / BPS_PER_PERCENT)));
        return signedPercentText(bps, this.locale);
    }

    public points(bps: number): string {
        this.cited.add(Math.abs(Math.round(bps / BPS_PER_PERCENT)));
        return pointsText(bps, this.locale);
    }

    public count(value: number): number {
        this.cited.add(value);
        return value;
    }

    public numbers(): readonly number[] {
        return [...this.cited].sort((left: number, right: number): number => left - right);
    }
}
