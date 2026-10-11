import { UpsertProviderAccountInput } from '../../transactions/services/financial-account.service';
import { PluggyAccount } from '../ports/pluggy-client.port';

const ACCOUNT_NAME_MAX_LENGTH: number = 60;
const LAST_DIGITS: number = 4;
const NON_DIGITS: RegExp = /\D/g;

const KIND_BY_SUBTYPE: ReadonlyMap<string, UpsertProviderAccountInput['kind']> = new Map<string, UpsertProviderAccountInput['kind']>([
    ['CHECKING_ACCOUNT', 'checking'],
    ['SAVINGS_ACCOUNT', 'savings']
]);

function kindOf(account: PluggyAccount): UpsertProviderAccountInput['kind'] {
    if (account.type === 'CREDIT') {
        return 'credit_card';
    }
    return account.type === 'BANK' ? (KIND_BY_SUBTYPE.get(account.subtype ?? '') ?? 'other') : 'other';
}

function nameOf(account: PluggyAccount): string {
    const marketing: string = (account.marketingName ?? '').trim();
    return (marketing.length > 0 ? marketing : account.name.trim()).slice(0, ACCOUNT_NAME_MAX_LENGTH);
}

function last4Of(number: string | null): string | null {
    const digits: string = (number ?? '').replace(NON_DIGITS, '');
    return digits.length < LAST_DIGITS ? null : digits.slice(-LAST_DIGITS);
}

export function mapAccount(account: PluggyAccount, connectorName: string | null): UpsertProviderAccountInput {
    return {
        provider: 'pluggy',
        externalId: account.id,
        kind: kindOf(account),
        name: nameOf(account),
        institutionName: connectorName,
        numberLast4: last4Of(account.number),
        currency: account.currencyCode.toUpperCase()
    };
}
