const ROUTINE_CATEGORY_PREFIXES: readonly string[] = [
    'valores mobiliarios negociados e detidos',
    'formulario cadastral',
    'dados cadastrais'
];

function normalized(value: string): string {
    return value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim();
}

export function isRoutineCategory(category: string): boolean {
    const comparable: string = normalized(category);
    return ROUTINE_CATEGORY_PREFIXES.some((prefix: string): boolean => comparable.startsWith(prefix));
}
