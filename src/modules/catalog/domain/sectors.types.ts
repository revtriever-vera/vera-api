export const SECTORS = {
    financeiro: 'financeiro',
    energiaEletrica: 'energia_eletrica',
    petroleoGas: 'petroleo_gas',
    mineracaoSiderurgia: 'mineracao_siderurgia',
    papelCelulose: 'papel_celulose',
    bensIndustriais: 'bens_industriais',
    tecnologia: 'tecnologia',
    consumo: 'consumo',
    saude: 'saude',
    varejo: 'varejo',
    imobiliarioLogistica: 'imobiliario_logistica',
    imobiliarioShoppings: 'imobiliario_shoppings',
    imobiliarioRecebiveis: 'imobiliario_recebiveis',
    imobiliarioLajes: 'imobiliario_lajes',
    imobiliarioHibrido: 'imobiliario_hibrido',
    etfIndice: 'etf_indice',
    cripto: 'cripto'
} as const;

export type Sector = (typeof SECTORS)[keyof typeof SECTORS];
