import { useState } from 'react';
import { useInstall } from '../pwa';

/** Bouton « Installer l'application » : invite native si possible, sinon marche à suivre. */
export function InstallButton({ variant = 'btn', hideWhenUnavailable }: { variant?: 'btn' | 'sheet' | 'compact'; hideWhenUnavailable?: boolean }) {
  const state = useInstall();
  const [help, setHelp] = useState(false);

  if (state.kind === 'installed') return variant === 'btn' ? <p className="muted">✅ L’application est installée sur cet appareil.</p> : null;
  if (state.kind === 'manual' && hideWhenUnavailable) return null;

  const onClick = () => (state.kind === 'prompt' ? state.install() : setHelp(!help));
  const cls = variant === 'sheet' ? 'sheet-link' : variant === 'compact' ? 'btn small install' : 'btn primary';
  return (
    <>
      <button className={cls} onClick={onClick}>📲 Installer l’application</button>
      {help && state.kind === 'manual' && <p className="install-help">{state.steps}</p>}
    </>
  );
}
