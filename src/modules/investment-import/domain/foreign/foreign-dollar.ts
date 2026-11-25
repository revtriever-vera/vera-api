import { currencyExponent, DecimalUtil, mulDecimal, toMinor } from '../../../../shared/utils/decimal.util';
import { EditedLine } from '../investment-import.types';

export function grossBrlOf(edited: EditedLine, grossMinor: number): number | null {
    const dollar: NonNullable<EditedLine['line']['dollar']> | undefined = edited.line.dollar;
    if (dollar === undefined) {
        return null;
    }
    if (!edited.repriced || dollar.fxRate === null) {
        return dollar.grossBrlMinor;
    }
    const major: string = DecimalUtil.of(grossMinor)
        .div(DecimalUtil.of(10).pow(currencyExponent(edited.line.currency)))
        .toFixed();
    return toMinor(mulDecimal(major, dollar.fxRate), 'BRL');
}
