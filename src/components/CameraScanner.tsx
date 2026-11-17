import { useEffect, useRef, useState } from "react";
import { Flashlight, ScanText, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ocrTombamento } from "@/lib/barcode";

type Caps = {
  zoom?: { min: number; max: number; step: number } | undefined;
  torch?: boolean;
};

/**
 * Valida e formata o tombamento no padrão 000000.000000.0000.
 * - Remove qualquer caractere não numérico.
 * - Exige exatamente 16 dígitos.
 * - Retorna null se o formato for inválido.
 */
function validarTombamento(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 16) return null;
  return `${digits.slice(0, 6)}.${digits.slice(6, 12)}.${digits.slice(12, 16)}`;
}

export function CameraScanner({
  onClose,
  onCode,
}: {
  onClose: () => void;
  onCode: (c: string, ocr?: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const quaggaRef = useRef<any>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  // Controle de duplicidade de leitura válida
  const lastCodeRef = useRef({ code: "", at: 0 });
  // Controle de throttle para leituras inválidas (evita re-render spam)
  const lastInvalidRef = useRef(0);
  // Controle de OCR em andamento
  const ocrBusy = useRef(false);
  // Marca temporal da última leitura (para detectar "sem leitura")
  const lastReadRef = useRef(Date.now());

  const [err, setErr] = useState<string | null>(null);
  const [lido, setLido] = useState("");
  const [formatoInvalido, setFormatoInvalido] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [devIdx, setDevIdx] = useState(-1);
  const [caps, setCaps] = useState<Caps>({});
  const [zoom, setZoom] = useState(1);
  const [torch, setTorch] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [semLeitura, setSemLeitura] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ativo, setAtivo] = useState(false);

  const track = () => streamRef.current?.getVideoTracks()[0];

  async function apply(c: Record<string, unknown>) {
    try {
      await track()?.applyConstraints({ advanced: [c as any] });
    } catch {
      /* recurso não suportado — ignorado */
    }
  }

  async function runOcr(manual: boolean) {
    const video = containerRef.current?.querySelector("video") as HTMLVideoElement | null;
    if (!video || ocrBusy.current || !video.videoWidth) return;

    ocrBusy.current = true;
    setOcrStatus("Lendo número impresso...");
    try {
      const t = await ocrTombamento(video);
      if (!t) {
        setOcrStatus(manual ? "Número não reconhecido. Tente de novo." : null);
        return;
      }
      const validado = validarTombamento(t);
      if (!validado) {
        setOcrStatus(`OCR leu "${t}" — formato inválido (esperado 000000.000000.0000)`);
        return;
      }
      setLido(validado);
      setOcrStatus(`Lido por OCR: ${validado}`);
      setFormatoInvalido(null);
      lastReadRef.current = Date.now();
      onCodeRef.current(validado, true);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } catch (e: any) {
      setOcrStatus("Erro no OCR: " + (e?.message ?? e));
    } finally {
      ocrBusy.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      setAtivo(false);
      try {
        quaggaRef.current?.stop();
      } catch {
        /* ignora */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      stop();
      try {
        const mod = await import("@ericblade/quagga2");
        const Quagga = (mod as any).default ?? mod;
        quaggaRef.current = Quagga;

        if (cancelled || !containerRef.current) return;

        const dev = devIdx >= 0 ? devices[devIdx] : undefined;
        const deviceConfig = dev
          ? { deviceId: { exact: dev.deviceId } }
          : { facingMode: "environment" as const };

        const config = {
          inputStream: {
            name: "Live",
            type: "LiveStream",
            target: containerRef.current,
            constraints: {
              ...deviceConfig,
              width: { min: 1280 },
              height: { min: 720 },
              aspectRatio: { min: 1, max: 2 },
            },
            // Área de interesse deve casar com o guia visual (10%–10% / 35%–35%)
            area: { top: "35%", right: "10%", left: "10%", bottom: "35%" },
          },
          locator: { patchSize: "small", halfSample: false },
          numOfWorkers: navigator.hardwareConcurrency || 2,
          decoder: { readers: ["code_128_reader"] },
          locate: true,
        };

        Quagga.init(config, (initErr: any) => {
          if (cancelled) return;

          if (initErr) {
            const name = initErr?.name ?? "";
            setErr(
              name === "NotAllowedError" || /permission/i.test(String(initErr?.message))
                ? "Permissão da câmera negada. Libere o acesso nas configurações."
                : "Não foi possível abrir a câmera: " + (initErr?.message ?? initErr),
            );
            return;
          }

          Quagga.start();
          setAtivo(true);
          setErr(null);

          const video = containerRef.current?.querySelector("video") as HTMLVideoElement | null;
          if (video && video.srcObject) {
            const stream = video.srcObject as MediaStream;
            streamRef.current = stream;
            const tr = stream.getVideoTracks()[0];
            const c: any = tr?.getCapabilities?.() ?? {};
            setCaps({
              zoom: c.zoom ? { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1 } : undefined,
              torch: !!c.torch,
            });
            if ((c.focusMode ?? []).includes("continuous")) {
              apply({ focusMode: "continuous" });
            }
          }

          Quagga.onDetected((result: any) => {
            const cr = result?.codeResult;
            if (!cr?.code || cr.format !== "code_128") return;

            const raw = String(cr.code).trim();
            const validado = validarTombamento(raw);
            const now = Date.now();

            if (!validado) {
              if (now - lastInvalidRef.current > 1500) {
                lastInvalidRef.current = now;
                setFormatoInvalido(raw);
              }
              return;
            }

            // Debounce: ignora re-leitura do MESMO código em < 1.5s
            if (validado === lastCodeRef.current.code && now - lastCodeRef.current.at < 1500) {
              return;
            }

            lastCodeRef.current = { code: validado, at: now };
            lastReadRef.current = now;
            setLido(validado);
            setFormatoInvalido(null);
            setSemLeitura(false);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 1500);
            onCodeRef.current(validado);
          });

          // ---- Loop auxiliar: detecta "sem leitura" e dispara OCR fallback ----
          timer = setInterval(() => {
            const idle = Date.now() - lastReadRef.current;
            setSemLeitura(idle > 10000);
            if (idle > 8000 && !ocrBusy.current) {
              void runOcr(false);
            }
          }, 1000);

          // ---- Listagem de câmeras ----
          if (!devices.length) {
            navigator.mediaDevices
              .enumerateDevices()
              .then((d) => !cancelled && setDevices(d.filter((x) => x.kind === "videoinput")))
              .catch(() => {});
          }
        });
      } catch (e: any) {
        setErr("Erro ao inicializar scanner: " + (e?.message ?? e));
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devIdx]);

  const estado = showSuccess
    ? "✓ Lido!"
    : formatoInvalido
      ? "Formato inválido"
      : semLeitura
        ? "Nada lido"
        : ativo
          ? "Aponte para o código"
          : "Iniciando...";

  const borda = showSuccess
    ? "border-success"
    : formatoInvalido || semLeitura
      ? "border-destructive"
      : "border-success";

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 max-h-[55vh] overflow-y-auto rounded-t-2xl border-t bg-card/95 p-2 shadow-2xl backdrop-blur-sm md:inset-x-auto md:bottom-4 md:right-4 md:w-[420px] md:rounded-2xl md:border">
      {/* Cabeçalho compacto */}
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-semibold">Scanner</div>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="text-muted-foreground hover:text-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {/* Container de vídeo — altura fixa, object-cover (sem barras pretas) */}
      <div className={`relative h-[32vh] w-full overflow-hidden rounded-lg border-2 bg-black transition-colors ${borda}`}>
        <div
          ref={containerRef}
          className="h-full w-full [&>video]:h-full [&>video]:w-full [&>video]:object-cover [&>canvas]:hidden"
        />

        {ativo && (
          <div className="pointer-events-none absolute inset-0">
            {/* Guia de foco (idêntico à área processada pelo Quagga) */}
            <div
              className="absolute"
              style={{
                left: "10%",
                right: "10%",
                top: "35%",
                bottom: "35%",
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }}
            >
              {(["tl", "tr", "bl", "br"] as const).map((pos) => {
                const base = {
                  position: "absolute" as const,
                  width: 20,
                  height: 20,
                  borderColor: "rgb(0 220 90)",
                  borderStyle: "solid" as const,
                };
                const style =
                  pos === "tl"
                    ? { ...base, left: 0, top: 0, borderWidth: "3px 0 0 3px" }
                    : pos === "tr"
                      ? { ...base, right: 0, top: 0, borderWidth: "3px 3px 0 0" }
                      : pos === "bl"
                        ? { ...base, left: 0, bottom: 0, borderWidth: "0 0 3px 3px" }
                        : { ...base, right: 0, bottom: 0, borderWidth: "0 3px 3px 0" };
                return <span key={pos} style={style} />;
              })}

              {showSuccess && (
                <div className="absolute inset-0 flex items-center justify-center bg-success/20">
                  <CheckCircle2 className="animate-in zoom-in text-success" size={48} />
                </div>
              )}
            </div>
          </div>
        )}

        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
          {estado}
        </span>
      </div>

      {/* Código lido */}
      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="truncate">
          Código: <span className="font-mono font-semibold">{lido || "—"}</span>
        </span>
      </div>

      {/* Mensagens de erro / status */}
      {formatoInvalido && (
        <p className="mt-1 flex items-center gap-1 rounded bg-destructive/10 px-2 py-1 text-[11px] text-destructive">
          <AlertTriangle size={12} className="shrink-0" />
          <span className="truncate">
            Formato inválido: <span className="font-mono">{formatoInvalido}</span> · esperado 000000.000000.0000
          </span>
        </p>
      )}
      {ocrStatus && <div className="mt-1 truncate text-[11px] text-muted-foreground">{ocrStatus}</div>}
      {err && <p className="mt-1 text-[11px] text-destructive">{err}</p>}

      {/* Controles compactos */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {caps.zoom &&
          [1, 2, 3]
            .filter((z) => z <= caps.zoom!.max)
            .map((z) => (
              <Button
                key={z}
                size="sm"
                variant={Math.round(zoom) === z ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setZoom(z);
                  apply({ zoom: Math.max(caps.zoom!.min, z) });
                }}
              >
                {z}x
              </Button>
            ))}

        {caps.torch && (
          <Button
            size="sm"
            variant={torch ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => {
              setTorch(!torch);
              apply({ torch: !torch });
            }}
          >
            <Flashlight size={12} className="mr-1" />
            Luz
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => runOcr(true)}
        >
          <ScanText size={12} className="mr-1" />
          OCR
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={devices.length < 2}
          onClick={() => setDevIdx((i) => (i + 1) % devices.length)}
        >
          Trocar
        </Button>

        <Button size="sm" onClick={onClose} className="ml-auto h-7 px-2 text-xs">
          Fechar
        </Button>
      </div>

      {/* Slider de zoom (opcional) */}
      {caps.zoom && (
        <label className="mt-1 block text-[10px] text-muted-foreground">
          Zoom {zoom.toFixed(1)}x
          <input
            type="range"
            className="w-full"
            min={caps.zoom.min}
            max={Math.min(caps.zoom.max, 5)}
            step={caps.zoom.step}
            value={zoom}
            onChange={(e) => {
              const z = Number(e.target.value);
              setZoom(z);
              apply({ zoom: z });
            }}
          />
        </label>
      )}
    </div>
  );
}