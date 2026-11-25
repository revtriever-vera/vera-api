import { AVENUE_MONTHS, AvenueMonth } from './avenue-data';
import { avenueStatementLines } from './avenue-layout';
import { buildImagePdf, buildTextPdf, rasterOfLines } from './avenue-pdf';
import { expectedAnswerOf } from './avenue-expected';

function filesOf(month: AvenueMonth): [string, Buffer][] {
    const lines = avenueStatementLines(month);
    const json: string = `${JSON.stringify(expectedAnswerOf(month), null, 2)}\n`;
    return [
        [`avenue/avenue-${month.slug}.pdf`, buildTextPdf(lines)],
        [`avenue/avenue-${month.slug}-escaneado.pdf`, buildImagePdf(rasterOfLines(lines))],
        [`avenue/avenue-${month.slug}.expected.json`, Buffer.from(json, 'utf8')]
    ];
}

export function buildAvenueStatements(): [string, Buffer][] {
    return AVENUE_MONTHS.flatMap(filesOf);
}
