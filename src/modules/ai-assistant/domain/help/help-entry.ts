import { HelpEntry, HelpEntrySpec } from './help.types';

export function helpEntry(spec: HelpEntrySpec): HelpEntry {
    return {
        id: spec.id,
        texts: { 'pt-BR': spec.pt, en: spec.en },
        ...(spec.screen === undefined
            ? {}
            : { screen: { path: spec.screen.path, label: { 'pt-BR': spec.screen.pt, en: spec.screen.en } } }),
        plans: spec.plans ?? 'all',
        ...(spec.minRole === undefined ? {} : { minRole: spec.minRole }),
        keywords: spec.keywords,
        synonyms: spec.synonyms ?? []
    };
}
