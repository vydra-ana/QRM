import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let frameId = 0;
    let detector: BarcodeDetector | null = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        if ('BarcodeDetector' in window) {
          detector = new BarcodeDetector({ formats: ['qr_code'] });
          const scan = async () => {
            if (doneRef.current || !videoRef.current) return;
            try {
              const codes = await detector!.detect(videoRef.current);
              if (codes.length > 0 && codes[0].rawValue) {
                doneRef.current = true;
                onScan(codes[0].rawValue.trim());
                return;
              }
            } catch {
              /* frame skip */
            }
            frameId = requestAnimationFrame(scan);
          };
          scan();
        } else {
          setError(
            'Váš prohlížeč nepodporuje skenování QR. Zadejte kód ručně nebo použijte Chrome na Androidu.',
          );
        }
      } catch {
        setError('Kamera není dostupná. Povolte přístup v nastavení telefonu.');
      }
    }

    start();

    return () => {
      cancelAnimationFrame(frameId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-sm font-bold uppercase tracking-wider text-white">Skenovat QR</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-neutral-700 p-2 text-neutral-400"
          aria-label="Zavřít"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-[env(safe-area-inset-bottom)]">
        <div className="relative w-full max-w-sm overflow-hidden rounded-xl border-2 border-yellow-500/40">
          <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-yellow-500/60" />
        </div>
        {error ? (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        ) : (
          <p className="mt-4 text-center text-xs text-neutral-400">
            Namiřte kameru na QR kód pracoviště
          </p>
        )}
      </div>
    </div>
  );
}
