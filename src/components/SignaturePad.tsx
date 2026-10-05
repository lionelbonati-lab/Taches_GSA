import { useEffect, useRef, useState } from 'react';

/**
 * Signature au doigt, au stylet ou à la souris. Le trait suit la pression du stylet quand elle est connue.
 * onChange reçoit l'image de la signature (PNG recadré, fond transparent) ou undefined si la zone est vide.
 */
export function SignaturePad({ onChange }: { onChange: (png: string | undefined) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Taille réelle en pixels de l'écran (trait net sur téléphone).
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f2a6b';
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = canvas.current!.getContext('2d')!;
    const p = point(e);
    ctx.lineWidth = e.pointerType === 'pen' && e.pressure > 0 ? 1 + e.pressure * 3 : 2.5;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onChange(empty ? undefined : crop(canvas.current!));
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
    onChange(undefined);
  };

  return (
    <div className="signature">
      <canvas
        ref={canvas}
        className="signature-pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="Zone de signature"
      />
      <div className="row">
        <small className="muted">{empty ? 'Signe dans le cadre, au doigt ou au stylet.' : 'Signature prête.'}</small>
        <span className="grow" />
        <button type="button" className="btn small" onClick={clear} disabled={empty}>Effacer</button>
      </div>
    </div>
  );
}

/** Image de la signature, recadrée sur le trait et réduite (600 px de large au plus). */
function crop(c: HTMLCanvasElement): string | undefined {
  const { width: w, height: h } = c;
  const px = c.getContext('2d')!.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return undefined;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const k = Math.min(1, 600 / (x1 - x0 + 1));
  const out = document.createElement('canvas');
  out.width = Math.round((x1 - x0 + 1) * k);
  out.height = Math.round((y1 - y0 + 1) * k);
  out.getContext('2d')!.drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
