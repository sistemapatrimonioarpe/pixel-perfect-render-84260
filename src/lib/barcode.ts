// Barcode decoding: native BarcodeDetector first, @zxing/browser (TRY_HARDER) as fallback.
const NATIVE_FORMATS = ["code_128", "code_39", "code_93", "codabar", "itf", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];

export const normalizarCodigo = (s: string) => s.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();

type Decoder = (src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement) => Promise<string | null>;

let cached: Promise<Decoder> | null = null;

export function getDecoder(): Promise<Decoder> {
  if (cached) return cached;
  cached = (async () => {
    const BD = (window as any).BarcodeDetector;
    if (BD) {
      try {
        const supported: string[] = (await BD.getSupportedFormats?.()) ?? NATIVE_FORMATS;
        const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        if (formats.length) {
          const det = new BD({ formats });
          return async (src) => {
            const r = await det.detect(src);
            return r?.[0]?.rawValue ?? null;
          };
        }
      } catch { /* fall through to zxing */ }
    }
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
    const hints = new Map<any, any>();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.CODABAR, BarcodeFormat.ITF,
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const canvas = document.createElement("canvas");
    return async (src) => {
      const w = (src as any).videoWidth || (src as any).naturalWidth || (src as any).width;
      const h = (src as any).videoHeight || (src as any).naturalHeight || (src as any).height;
      if (!w || !h) return null;
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(src as CanvasImageSource, 0, 0, w, h);
      try { return reader.decodeFromCanvas(canvas).getText(); } catch { return null; }
    };
  })();
  return cached;
}

export async function decodeFile(file: File): Promise<string | null> {
  const decode = await getDecoder();
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await decode(img);
  } finally { URL.revokeObjectURL(url); }
}
