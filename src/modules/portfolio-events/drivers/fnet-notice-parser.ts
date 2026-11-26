import { Buffer } from 'node:buffer';
import { EVENT_KINDS, EventKind, PortfolioEventDraft } from '../domain/portfolio-events.types';
import { FnetListItem, FnetProvento, fnetProventoSchema } from '../validation/fnet.schemas';

const NOTICE_TYPE: string = 'aviso aos cotistas';
const STRUCTURED: string = 'estruturado';
const ACTIVE_STATUS: string = 'AC';
const PROVENTO_BLOCK: RegExp = /<Provento>([\s\S]*?)<\/Provento>/g;

const TIPO_TAG: RegExp = /<TipoProvento>([^<]*)<\/TipoProvento>/;
const DATA_BASE_TAG: RegExp = /<DataBase>([^<]*)<\/DataBase>/;
const DATA_PAGAMENTO_TAG: RegExp = /<DataPagamento>([^<]*)<\/DataPagamento>/;
const VALOR_TAG: RegExp = /<ValorProventoCota>([^<]*)<\/ValorProventoCota>/;

export function isStructuredActiveNotice(item: FnetListItem): boolean {
    const type: string = item.tipoDocumento.toLowerCase();
    return item.status === ACTIVE_STATUS && type.includes(NOTICE_TYPE) && type.includes(STRUCTURED);
}

export function decodeDocument(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
}

function textOf(block: string, tag: RegExp): string | null {
    return tag.exec(block)?.[1]?.trim() ?? null;
}

function kindOf(tipo: string): EventKind {
    return tipo.toLowerCase().includes('amortiza') ? EVENT_KINDS.amortization : EVENT_KINDS.fiiIncome;
}

function proventoOf(block: string): FnetProvento | null {
    const parsed: ReturnType<typeof fnetProventoSchema.safeParse> = fnetProventoSchema.safeParse({
        tipo: textOf(block, TIPO_TAG) ?? '',
        dataBase: textOf(block, DATA_BASE_TAG) ?? '',
        dataPagamento: textOf(block, DATA_PAGAMENTO_TAG),
        valor: textOf(block, VALOR_TAG) ?? ''
    });
    return parsed.success ? parsed.data : null;
}

export function parseNoticeDocument(xml: string, cnpj: string, documentUrl: string): PortfolioEventDraft[] {
    const drafts: PortfolioEventDraft[] = [];
    for (const match of xml.matchAll(PROVENTO_BLOCK)) {
        const provento: FnetProvento | null = proventoOf(match[1] ?? '');
        if (provento !== null) {
            const kind: EventKind = kindOf(provento.tipo);
            drafts.push({
                kind,
                exDate: provento.dataBase,
                paymentDate: provento.dataPagamento,
                eventDate: null,
                amountPerUnit: provento.valor,
                currency: 'BRL',
                externalKey: `${cnpj}:${kind}:${provento.dataBase}`,
                documentUrl
            });
        }
    }
    return drafts;
}
