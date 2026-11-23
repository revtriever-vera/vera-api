import { byAmount, Charge } from './charge';
import { median } from './recurring-math';
import { BAND_TOLERANCE } from './recurring.types';

function fitsBand(band: readonly Charge[], candidate: Charge): boolean {
    const center: number = median(band.map((charge: Charge): number => charge.amountMinor));
    return Math.abs(candidate.amountMinor - center) <= BAND_TOLERANCE * center;
}

export function groupIntoBands(charges: readonly Charge[]): readonly (readonly Charge[])[] {
    const bands: Charge[][] = [];
    for (const charge of [...charges].sort(byAmount)) {
        const current: Charge[] | undefined = bands[bands.length - 1];
        if (current !== undefined && fitsBand(current, charge)) {
            current.push(charge);
            continue;
        }
        bands.push([charge]);
    }
    return bands;
}
