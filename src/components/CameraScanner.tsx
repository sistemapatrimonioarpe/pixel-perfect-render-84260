import { useEffect, useRef, useState } from "react";
import { Flashlight, ScanText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decodeEnhanced, getDecoder, ocrTombamento, sharpness } from "@/lib/barcode";

type Caps = {
  zoom?: { min: number; max: number; step: number } | undefined;
  torch?: boolean;
  focusModes: string[];
  focusDistance?: { min: number; max: number; step: number } | undefined;
};

// Laplacian variance thresholds (measured on a 320px-wide copy)
const BLUR = 60, READY = 140;

/** Single camera instance in a fixed panel; continuous reading; OCR fallback after 8 s. */
export function CameraScanner({ onClose, onCode }: { onClose: () => void; onCode: (c: string, ocr?: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const lastReadRef = useRef(Date.now());
  const ocrBusy = useRef(false);
  const [err, setErr] = useState<string | null>(null);
  const [lido, setLido] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devIdx, setDevIdx] = useState(-1);
  const [caps, setCaps] = useState<Caps>({ focusModes: [] });
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [focusDist, setFocusDist] = useState<number | null>(null);
  const [quality, setQuality] = useState(0);
  const [semLeitura, setSemLeitura] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [tap, setTap] = useState<{ x: number; y: number; k: number } | null>(null);

  const track = () => streamRef.current?.getVideoTracks()[0];
  async function apply(c: Record<string, unknown>) { try { await track()?.applyConstraints({ advanced: [c as any] }); } catch { /* unsupported */ } }

  async function runOcr(manual: boolean) {
    const v = videoRef.current;
    if (!v || ocrBusy.current || !v.videoWidth) return;
    ocrBusy.current = true; setOcrStatus("Lendo número impresso...");
    try {
      const t = await ocrTombamento(v);
      if (t) { setLido(t); setOcrStatus(`Lido por OCR: ${t}`); lastReadRef.current = Date.now(); onCodeRef.current(t, true); }
      else setOcrStatus(manual ? "Número não reconhecido (formato 000000.000000.0000). Tente de novo." : null);
    } catch (e: any) { setOcrStatus("Erro no OCR: " + (e?.message ?? e)); }
    finally { ocrBusy.current = false; }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
    (async () => {
      stop();
      try {
        const dev = devIdx >= 0 ? devices[devIdx] : undefined;
        const base = dev ? { deviceId: { exact: dev.deviceId } } : { facingMode: "environment" };
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } } });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } });
        }
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const tr = stream.getVideoTracks()[0]!;
        const c: any = tr.getCapabilities?.() ?? {};
        const focusModes: string[] = c.focusMode ?? [];
        if (focusModes.includes("continuous")) await apply({ focusMode: "continuous" });
        setCaps({
          zoom: c.zoom ? { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1 } : undefined,
          torch: !!c.torch,
          focusModes,
          focusDistance: c.focusDistance && focusModes.includes("manual") ? { min: c.focusDistance.min, max: c.focusDistance.max, step: c.focusDistance.step || 0.01 } : undefined,
        });
        setZoom(1); setTorch(false); setFocusDist(null);
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        if (!devices.length) navigator.mediaDevices.enumerateDevices().then((d) => !cancelled && setDevices(d.filter((x) => x.kind === "videoinput"))).catch(() => {});
        await getDecoder();
        lastReadRef.current = Date.now();
        let running = false;
        timer = setInterval(async () => {
          if (running || cancelled || !v.videoWidth) return;
          running = true;
          try {
            const s = sharpness(v);
            setQuality(s);
            const idle = Date.now() - lastReadRef.current;
            setSemLeitura(idle > 10000);
            if (idle > 8000 && s >= BLUR && !ocrBusy.current) void runOcr(false);
            if (s < BLUR) return;
            const text = await decodeEnhanced(v, s >= READY ? [{ scale: 1.5 }] : [{ scale: 1.5 }, { scale: 2 }]);
            if (text) {
              const t = text.trim();
              setLido(t); lastReadRef.current = Date.now(); setSemLeitura(false);
              onCodeRef.current(t); // parent ignores repeats within 2 s
            }
          } catch { /* keep scanning */ } finally { running = false; }
        }, 150);
        setErr(null);
      } catch (e: any) {
        const name = e?.name ?? "";
        setErr(name === "NotAllowedError" || /permission/i.test(String(e?.message)) ? "A permissão da câmera foi negada. Libere o acesso à câmera nas configurações do navegador e tente de novo." : "Não foi possível abrir a câmera: " + (e?.message ?? e));
      }
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devIdx]);

  async function tapFocus(ev: React.PointerEvent<HTMLDivElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    setTap({ x, y, k: Date.now() });
    setTimeout(() => setTap(null), 900);
    const m = caps.focusModes;
    if (m.includes("single-shot")) await apply({ focusMode: "single-shot", pointsOfInterest: [{ x, y }] });
    else if (m.includes("manual") && caps.focusDistance) await apply({ focusMode: "manual", focusDistance: caps.focusDistance.min });
    if (m.includes("continuous")) setTimeout(() => apply({ focusMode: "continuous" }), 1200);
  }

  const temFoco = caps.focusModes.length > 0;
  const borda = quality < BLUR ? "border-destructive" : quality < READY ? "border-warning" : "border-success";
  const estado = quality < BLUR ? "Focando..." : quality < READY ? "Quase nítido" : "Nítido — lendo";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] overflow-y-auto rounded-t-2xl border-t bg-card p-3 shadow-2xl md:inset-x-auto md:bottom-4 md:right-4 md:w-[520px] md:rounded-2xl md:border">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">Câmera — leitura contínua</div>
        <button onClick={onClose} aria-label="Fechar câmera" className="text-muted-foreground"><X size={20} /></button>
      </div>
      <div className={`relative overflow-hidden rounded-xl border-4 transition-colors ${borda}`} onPointerDown={tapFocus}>
        <video ref={videoRef} playsInline muted className="aspect-video w-full bg-muted object-cover" />
        <span className="absolute left-2 top-2 rounded-md bg-background/80 px-2 py-0.5 text-xs font-medium">{estado}</span>
        {tap && <span key={tap.k} className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 animate-pop rounded-md border-2 border-warning" style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }} />}
      </div>
      <div className="mt-2 text-sm">Código lido: <span className="font-mono font-semibold">{lido || "—"}</span></div>
      {ocrStatus && <div className="text-xs text-muted-foreground">{ocrStatus}</div>}
      {err && <p className="text-sm text-destructive">{err}</p>}
      {semLeitura && !err && <p className="mt-1 rounded-md bg-warning-soft px-2 py-1 text-xs text-warning-foreground">Nada lido ainda. Use o botão "Foto da etiqueta" ou "Ler número impresso".</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {caps.zoom && [1, 2, 3].filter((z) => z <= caps.zoom!.max).map((z) => (
          <Button key={z} size="sm" variant={Math.round(zoom) === z ? "default" : "outline"} onClick={() => { setZoom(z); apply({ zoom: Math.max(caps.zoom!.min, z) }); }}>{z}x</Button>
        ))}
        {caps.torch && <Button size="sm" variant={torch ? "default" : "outline"} onClick={() => { setTorch(!torch); apply({ torch: !torch }); }}><Flashlight />Lanterna</Button>}
        <Button size="sm" variant="outline" onClick={() => runOcr(true)}><ScanText />Ler número impresso</Button>
      </div>
      {caps.zoom && (
        <label className="mt-2 block text-xs text-muted-foreground">Zoom {zoom.toFixed(1)}x
          <input type="range" className="w-full" min={caps.zoom.min} max={Math.min(caps.zoom.max, 5)} step={caps.zoom.step} value={zoom}
            onChange={(e) => { const z = Number(e.target.value); setZoom(z); apply({ zoom: z }); }} />
        </label>
      )}
      {caps.focusDistance && (
        <label className="mt-2 block text-xs text-muted-foreground">Distância do foco
          <input type="range" className="w-full" min={caps.focusDistance.min} max={caps.focusDistance.max} step={caps.focusDistance.step} value={focusDist ?? caps.focusDistance.min}
            onChange={(e) => { const f = Number(e.target.value); setFocusDist(f); apply({ focusMode: "manual", focusDistance: f }); }} />
        </label>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Deixe a etiqueta na horizontal, a 15-25 cm, sem reflexo. Prefira o ZOOM a aproximar demais o celular (muito perto desfoca).
        {temFoco ? " Toque no vídeo para focar." : " Afaste o celular 15-25 cm, espere focar e aproxime devagar."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={devices.length < 2} onClick={() => setDevIdx((i) => (i + 1) % devices.length)}>Trocar câmera</Button>
        <Button onClick={onClose}>Fechar câmera</Button>
      </div>
      {devices.length > 1 && (
        <select className="mt-2 h-10 w-full rounded-md border border-input bg-card px-2 text-sm" value={devIdx} onChange={(e) => setDevIdx(Number(e.target.value))}>
          <option value={-1}>Câmera traseira (padrão)</option>
          {devices.map((d, i) => <option key={d.deviceId || i} value={i}>{d.label || `Câmera ${i + 1}`}</option>)}
        </select>
      )}
    </div>
  );
}
