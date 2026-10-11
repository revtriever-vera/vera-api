const BANKS_BY_CODE: Readonly<Record<number, string>> = {
    1: 'Banco do Brasil',
    33: 'Santander',
    41: 'Banrisul',
    77: 'Inter',
    104: 'Caixa',
    208: 'BTG Pactual',
    212: 'Original',
    237: 'Bradesco',
    260: 'Nubank',
    290: 'PagBank',
    318: 'BMG',
    323: 'Mercado Pago',
    336: 'C6 Bank',
    341: 'Itaú',
    422: 'Safra',
    748: 'Sicredi',
    756: 'Sicoob'
};

export function bankNameOf(bankId: string | undefined): string | null {
    const digits: string = (bankId ?? '').replace(/\D/g, '');
    return digits === '' ? null : (BANKS_BY_CODE[Number(digits)] ?? null);
}
