import { addNoise, blurRegion, cropRaster, rotateOnBackground, scaleBrightness, vignette } from './image-effects';
import { Raster } from './png-writer';
import { Color, createRaster, drawText, fillRect, textWidth } from './raster';
import { SYNTHETIC_BROKER } from './synthetic-identity';

interface ScreenRow {
    readonly ticker: string;
    readonly quantity: string;
    readonly price: string;
    readonly value: string;
}

interface ScreenLabels {
    readonly title: string;
    readonly quantity: string;
    readonly price: string;
    readonly value: string;
    readonly total: string;
}

interface ScreenSpec {
    readonly labels: ScreenLabels;
    readonly rows: readonly ScreenRow[];
    readonly total: string;
}

export interface ScreenFile {
    readonly name: string;
    readonly raster: Raster;
}

const WIDTH: number = 720;
const HEIGHT: number = 1280;
const SCALE: number = 4;
const ROW_TOP: number = 360;
const ROW_STEP: number = 120;
const VALUE_X: number = 470;
const PAPER: Color = [250, 250, 252];
const INK: Color = [30, 32, 40];
const ACCENT: Color = [40, 80, 160];
const MUTED: Color = [120, 124, 136];

const PORTUGUESE: ScreenLabels = { title: 'MINHA CARTEIRA', quantity: 'QTD', price: 'PRECO', value: 'VALOR', total: 'SALDO TOTAL' };
const ENGLISH: ScreenLabels = { title: 'MY PORTFOLIO', quantity: 'SHARES', price: 'PRICE', value: 'VALUE', total: 'TOTAL BALANCE' };

const KNOWN_ROWS: readonly ScreenRow[] = [
    { ticker: 'PETR4', quantity: '227', price: '38,52', value: '8.744,04' },
    { ticker: 'VALE3', quantity: '100', price: '61,10', value: '6.110,00' },
    { ticker: 'ITUB4', quantity: '400', price: '33,45', value: '13.380,00' },
    { ticker: 'BOVA11', quantity: '50', price: '128,90', value: '6.445,00' },
    { ticker: 'HGLG11', quantity: '60', price: '158,20', value: '9.492,00' }
];

const UNKNOWN_ROWS: readonly ScreenRow[] = [
    { ticker: 'ZZZZ99', quantity: '120', price: '12,30', value: '1.476,00' },
    { ticker: 'QQQQ3', quantity: '75', price: '8,05', value: '603,75' },
    { ticker: 'XXXX11', quantity: '30', price: '99,90', value: '2.997,00' }
];

function drawRow(raster: Raster, row: ScreenRow, top: number): void {
    drawText(raster, row.ticker, 40, top, SCALE, INK);
    drawText(raster, `${row.quantity} X ${row.price}`, 40, top + 44, 3, MUTED);
    drawText(raster, row.value, VALUE_X, top + 10, 3, INK);
    fillRect(raster, 40, top + 90, WIDTH - 80, 2, [225, 227, 232]);
}

function renderScreen(spec: ScreenSpec): Raster {
    const raster: Raster = createRaster(WIDTH, HEIGHT, PAPER);
    fillRect(raster, 0, 0, WIDTH, 150, ACCENT);
    drawText(raster, SYNTHETIC_BROKER, 40, 30, 3, [255, 255, 255]);
    drawText(raster, spec.labels.title, 40, 90, 4, [255, 255, 255]);
    drawText(raster, spec.labels.total, 40, 200, 3, MUTED);
    drawText(raster, `R$ ${spec.total}`, 40, 250, 6, INK);
    drawText(raster, `${spec.labels.quantity} X ${spec.labels.price}`, 40, 320, 2, MUTED);
    drawText(raster, spec.labels.value, WIDTH - 40 - textWidth(spec.labels.value, 2), 320, 2, MUTED);
    spec.rows.forEach((row: ScreenRow, index: number): void => {
        drawRow(raster, row, ROW_TOP + index * ROW_STEP);
    });
    return raster;
}

const BASE_SPEC: ScreenSpec = { labels: PORTUGUESE, rows: KNOWN_ROWS, total: '44.171,04' };

function tiltedPhoto(raster: Raster): Raster {
    const tilted: Raster = rotateOnBackground(raster, 7, [92, 74, 58]);
    return addNoise(vignette(scaleBrightness(tilted, 0.92), 0.5), 18, 7);
}

function illegibleNumbers(raster: Raster): Raster {
    return blurRegion(raster, VALUE_X - 10, 230, WIDTH - VALUE_X, 700, 9, 4);
}

export function buildBrokerScreens(): ScreenFile[] {
    const sharp: Raster = renderScreen(BASE_SPEC);
    return [
        { name: 'tela-nitida', raster: sharp },
        { name: 'tela-foto-inclinada', raster: tiltedPhoto(sharp) },
        { name: 'tela-recorte-parcial', raster: cropRaster(sharp, 520, 820) },
        { name: 'tela-escura', raster: addNoise(scaleBrightness(sharp, 0.22), 14, 11) },
        { name: 'tela-numero-ilegivel', raster: illegibleNumbers(sharp) },
        { name: 'tela-ativo-inexistente', raster: renderScreen({ ...BASE_SPEC, rows: UNKNOWN_ROWS, total: '5.076,75' }) },
        { name: 'tela-ingles', raster: renderScreen({ ...BASE_SPEC, labels: ENGLISH }) }
    ];
}
