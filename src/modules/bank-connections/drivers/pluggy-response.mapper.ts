import { PluggyAccount, PluggyMerchant, PluggyParty, PluggyPaymentData, PluggyTransaction } from '../ports/pluggy-client.port';
import { PluggyAccountResponse, PluggyTransactionResponse } from '../validation/pluggy-responses.schemas';

type PartyResponse = NonNullable<NonNullable<PluggyTransactionResponse['paymentData']>['payer']>;

const DEFAULT_STATUS: string = 'POSTED';
const DEFAULT_CURRENCY: string = 'BRL';

export function toAccount(account: PluggyAccountResponse): PluggyAccount {
    return {
        id: account.id,
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
        marketingName: account.marketingName ?? null,
        number: account.number ?? null,
        currencyCode: account.currencyCode
    };
}

function toParty(party: PartyResponse | null | undefined): PluggyParty | null {
    if (party === null || party === undefined) {
        return null;
    }
    return { name: party.name ?? null, documentNumber: party.documentNumber?.value ?? null };
}

function toPaymentData(data: PluggyTransactionResponse['paymentData']): PluggyPaymentData | null {
    if (data === null || data === undefined) {
        return null;
    }
    return { payer: toParty(data.payer), receiver: toParty(data.receiver) };
}

function toMerchant(merchant: PluggyTransactionResponse['merchant']): PluggyMerchant | null {
    if (merchant === null || merchant === undefined) {
        return null;
    }
    return { name: merchant.name ?? null, businessName: merchant.businessName ?? null, cnpj: merchant.cnpj ?? null };
}

function toAmounts(transaction: PluggyTransactionResponse): Pick<PluggyTransaction, 'amount' | 'currencyCode' | 'amountInAccountCurrency'> {
    return {
        amount: transaction.amount,
        currencyCode: transaction.currencyCode ?? DEFAULT_CURRENCY,
        amountInAccountCurrency: transaction.amountInAccountCurrency ?? null
    };
}

function toInstallments(transaction: PluggyTransactionResponse): Pick<PluggyTransaction, 'installmentNumber' | 'installmentTotal'> {
    return {
        installmentNumber: transaction.creditCardMetadata?.installmentNumber ?? null,
        installmentTotal: transaction.creditCardMetadata?.totalInstallments ?? null
    };
}

export function toTransaction(transaction: PluggyTransactionResponse, accountId: string): PluggyTransaction {
    return {
        id: transaction.id,
        accountId: transaction.accountId ?? accountId,
        date: transaction.date,
        description: transaction.description,
        descriptionRaw: transaction.descriptionRaw ?? null,
        status: transaction.status ?? DEFAULT_STATUS,
        categoryId: transaction.categoryId ?? null,
        paymentData: toPaymentData(transaction.paymentData),
        merchant: toMerchant(transaction.merchant),
        ...toAmounts(transaction),
        ...toInstallments(transaction)
    };
}
