import { TemplateDefinition, TemplateLanguage } from './whatsapp.types';

export const REMINDER_TEMPLATE_KEY: string = 'vera_lembrete';
export const TEMPLATE_LANGUAGES: readonly TemplateLanguage[] = ['pt_BR', 'en'];

type CatalogEntry = {
    readonly key: string;
    readonly version: number;
    readonly bodies: Readonly<Record<TemplateLanguage, string>>;
    readonly examples: Readonly<Record<TemplateLanguage, readonly string[]>>;
};

export const TEMPLATE_CATALOG: readonly CatalogEntry[] = [
    {
        key: REMINDER_TEMPLATE_KEY,
        version: 1,
        bodies: { pt_BR: 'Lembrete da Vera: {{1}}', en: 'Vera reminder: {{1}}' },
        examples: { pt_BR: ['Pagar a fatura do cartao'], en: ['Pay the card bill'] }
    }
];

export function remoteNameOf(key: string, version: number): string {
    return version <= 1 ? key : `${key}_v${String(version)}`;
}

export function placeholdersOf(body: string): number {
    return new Set(body.match(/\{\{\d+\}\}/g) ?? []).size;
}

export function catalogDefinitions(): TemplateDefinition[] {
    return TEMPLATE_CATALOG.flatMap((entry: CatalogEntry): TemplateDefinition[] =>
        TEMPLATE_LANGUAGES.map((language: TemplateLanguage): TemplateDefinition => ({
            name: remoteNameOf(entry.key, entry.version),
            language,
            category: 'UTILITY',
            body: entry.bodies[language],
            examples: entry.examples[language]
        }))
    );
}

export function versionOf(name: string): number {
    const entry: CatalogEntry | undefined = TEMPLATE_CATALOG.find(
        (candidate: CatalogEntry): boolean => remoteNameOf(candidate.key, candidate.version) === name
    );
    return entry?.version ?? 1;
}

export function currentTemplateName(key: string): string | null {
    const entry: CatalogEntry | undefined = TEMPLATE_CATALOG.find((candidate: CatalogEntry): boolean => candidate.key === key);
    return entry === undefined ? null : remoteNameOf(entry.key, entry.version);
}
