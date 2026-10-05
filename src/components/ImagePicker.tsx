import { useRef, useState } from 'react';
import { isImage, prepareImage } from '../data/logo';

/** Choix d'une image (logo ou image d'en-tête) : aperçu, choisir, retirer. L'image est réduite avant d'être gardée. */
export function ImagePicker({ value, onChange, kind, disabled, empty }: {
  value?: string;
  onChange: (v: string | undefined) => void | Promise<void>;
  kind: 'logo' | 'banniere';
  disabled?: boolean;
  /** Texte affiché sans image. */
  empty: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (file?: File) => {
    if (!file) return;
    setErr('');
    setBusy(true);
    try {
      await onChange(await prepareImage(file, kind));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    setErr('');
    setBusy(true);
    try {
      await onChange(undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`image-picker ${kind}`}>
      <div className="image-preview">{isImage(value) ? <img src={value} alt="" /> : <span className="muted">{empty}</span>}</div>
      {!disabled && (
        <div className="row">
          <button type="button" className="btn small" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Préparation…' : isImage(value) ? 'Changer l’image…' : 'Choisir une image…'}
          </button>
          {isImage(value) && <button type="button" className="btn small" disabled={busy} onClick={remove}>Retirer</button>}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" hidden onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
      )}
      {err && <p className="error">{err}</p>}
    </div>
  );
}
