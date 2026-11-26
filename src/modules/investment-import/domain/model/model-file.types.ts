export const MODEL_FILE_KINDS = { pdf: 'pdf', png: 'png', jpeg: 'jpeg', webp: 'webp', heic: 'heic' } as const;
export type ModelFileKind = (typeof MODEL_FILE_KINDS)[keyof typeof MODEL_FILE_KINDS];
