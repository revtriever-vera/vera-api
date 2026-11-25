declare module 'heic-convert' {
    interface HeicConvertOptions {
        readonly buffer: Uint8Array;
        readonly format: 'JPEG' | 'PNG';
        readonly quality?: number;
    }

    function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer>;

    export = heicConvert;
}
