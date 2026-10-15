// Barcode decoding: native BarcodeDetector first, @zxing/browser (TRY_HARDER) as fallback.
// Also: frame sharpness, preprocessing (gray/contrast/sharpen/scale) and OCR of the printed number.
const NATIVE_FORMATS = ["code_128", "code_39", "code_93", "codabar", "itf", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"];

export const normalizarCodigo = (s: string) => s.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase();

type Src = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | HTMLImageElement;
type Decoder = (src: Src) => Promise<string | null>;

let cached: Promise<Decoder> | null = null;

const dims = (src: any) => ({ w: src.videoWidth || src.naturalWidth || src.width, h: src.videoHeight || src.naturalHeight || src.height });

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
      let c: HTMLCanvasElement;
      if (src instanceof HTMLCanvasElement) c = src;
      else {
        const { w, h } = dims(src);
        if (!w || !h) return null;
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(src as CanvasImageSource, 0, 0, w, h);
        c = canvas;
      }
      try { return reader.decodeFromCanvas(c).getText(); } catch { return null; }
    };
  })();
  return cached;
}

/** Variance of the Laplacian on a small grayscale copy of the center region. Higher = sharper. */
const sharpCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
export function sharpness(src: Src): number {
  const { w, h } = dims(src);
  if (!w || !h || !sharpCanvas) return 0;
  const W = 320, H = Math.round((320 * h) / w);
  sharpCanvas.width = W; sharpCanvas.height = H;
  const ctx = sharpCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src as CanvasImageSource, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!;
  let sum = 0, sq = 0, n = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const l = g[i - 1]! + g[i + 1]! + g[i - W]! + g[i + W]! - 4 * g[i]!;
    sum += l; sq += l * l; n++;
  }
  if (!n) return 0;
  const m = sum / n;
  return sq / n - m * m;
}

/** Grayscale + contrast stretch + light sharpen, optionally scaled / rotated / cropped. */
export function preprocess(src: Src, opts: { scale?: number; rotate?: boolean; crop?: { x: number; y: number; w: number; h: number }; sharpen?: boolean; threshold?: boolean } = {}): HTMLCanvasElement {
  const { w: sw, h: sh } = dims(src);
  const cr = opts.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cx = cr.x * sw, cy = cr.y * sh, cw = cr.w * sw, ch = cr.h * sh;
  const maxSide = 2400;
  let scale = opts.scale ?? 1;
  scale = Math.min(scale, maxSide / Math.max(cw, ch));
  const W = Math.max(1, Math.round(cw * scale)), H = Math.max(1, Math.round(ch * scale));
  const c = document.createElement("canvas");
  c.width = opts.rotate ? H : W; c.height = opts.rotate ? W : H;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  if (opts.rotate) { ctx.translate(H, 0); ctx.rotate(Math.PI / 2); }
  ctx.drawImage(src as CanvasImageSource, cx, cy, cw, ch, 0, 0, W, H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, n = c.width * c.height;
  const g = new Uint8ClampedArray(n);
  let min = 255, max = 0;
  for (let i = 0; i < n; i++) { const v = 0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!; g[i] = v; if (v < min) min = v; if (v > max) max = v; }
  const range = Math.max(1, max - min);
  for (let i = 0; i < n; i++) g[i] = ((g[i]! - min) * 255) / range;
  let out = g;
  if (opts.sharpen !== false) {
    const Wc = c.width, Hc = c.height;
    out = new Uint8ClampedArray(n);
    for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
      const i = y * Wc + x;
      if (x === 0 || y === 0 || x === Wc - 1 || y === Hc - 1) { out[i] = g[i]!; continue; }
      out[i] = 5 * g[i]! - g[i - 1]! - g[i + 1]! - g[i - Wc]! - g[i + Wc]!;
    }
  }
  for (let i = 0; i < n; i++) { const v = opts.threshold ? (out[i]! > 128 ? 255 : 0) : out[i]!; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Try plain frame, then enhanced versions at 1.5x and 2x. */
export async function decodeEnhanced(src: Src, tries: Array<Parameters<typeof preprocess>[1]> = [{ scale: 1.5 }, { scale: 2 }]): Promise<string | null> {
  const decode = await getDecoder();
  const direct = await decode(src).catch(() => null);
  if (direct) return direct;
  for (const t of tries) {
    const r = await decode(preprocess(src, t)).catch(() => null);
    if (r) return r;
  }
  return null;
}

export async function decodeFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return await decodeEnhanced(img, [{ scale: 1, sharpen: false }, { scale: 2 }, { scale: 1, rotate: true }, { scale: 2, rotate: true }]);
  } finally { URL.revokeObjectURL(url); }
}

// ---------- OCR of the printed number (e.g. 410201.000122.2024) ----------
export const PADRAO_TOMBAMENTO = /\d{6}\.\d{6}\.\d{4}/;
let worker: Promise<any> | null = null;
function getWorker() {
  if (!worker) worker = (async () => {
    const { createWorker } = await import("tesseract.js");
    const w = await createWorker("eng");
    await w.setParameters({ tessedit_char_whitelist: "0123456789.", tessedit_pageseg_mode: "6" as any });
    return w;
  })();
  return worker;
}

/** OCR over a few horizontal bands of the frame; only returns text matching the tombamento pattern. */
export async function ocrTombamento(src: Src): Promise<string | null> {
  const w = await getWorker();
  const regions = [
    { x: 0.05, y: 0.35, w: 0.9, h: 0.4 },
    { x: 0.05, y: 0.5, w: 0.9, h: 0.4 },
    { x: 0, y: 0, w: 1, h: 1 },
  ];
  for (const crop of regions) {
    const c = preprocess(src, { crop, scale: 2, sharpen: false, threshold: true });
    const { data } = await w.recognize(c);
    const txt = String(data?.text ?? "").replace(/\s+/g, "");
    const m = txt.match(PADRAO_TOMBAMENTO);
    if (m) return m[0];
  }
  return null;
}
