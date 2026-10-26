import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icone } from './icones';
import { MESSAGE_MISE_A_JOUR, moduleIntrouvable } from '../pwa';
import { noterErreur, pileCourte, rapportBranche } from '../data/rapportErreurs';

// Une erreur pendant l'affichage : un message lisible (à copier pour le signaler) au lieu d'un écran blanc.
// « page » : seule la page est remplacée, les menus restent utilisables ; le message disparaît en changeant de page.
// L'erreur est aussi signalée d'elle-même aux admins du comité central (rapport d'erreurs, 051).

type Props = { children: ReactNode; page?: string };
type State = { error: Error | null; where: string; page?: string; signalee?: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, where: '', page: this.props.page };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.page !== state.page ? { error: null, where: '', page: props.page, signalee: false } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    const signalee = noterErreur(error, 'affichage', info.componentStack ?? '') && rapportBranche();
    this.setState({ where: info.componentStack ?? '', signalee });
  }

  render() {
    const { error, where, signalee } = this.state;
    if (!error) return this.props.children;
    const details = [
      `${error.name}: ${error.message}`,
      `Page : ${location.hash || '#/'}`,
      `Appareil : ${navigator.userAgent}`,
      pileCourte(error.stack ?? ''),
      pileCourte(where),
    ].join('\n\n');
    const copier = () => void navigator.clipboard?.writeText(details).catch(() => {});
    return (
      <div className="panel erreur-appli" role="alert">
        <h2>😕 Oups, un problème d’affichage</h2>
        <p>
          {moduleIntrouvable(error) && !navigator.onLine ? (
            <>Hors connexion : cette page n’a pas encore été chargée sur cet appareil. Reconnecte-toi, puis recharge.</>
          ) : moduleIntrouvable(error) ? (
            <>{MESSAGE_MISE_A_JOUR} Si le problème revient, copie le message ci-dessous et envoie-le.</>
          ) : (
            <>
              {this.props.page !== undefined
                ? 'Cette page n’a pas pu s’afficher. Les menus restent utilisables ; tu peux aussi recharger.'
                : 'L’application n’a pas pu s’afficher. Recharge la page.'}{' '}
              {signalee ? 'Le problème a été signalé aux admins du club.' : 'Pour qu’on corrige, copie le message ci-dessous et envoie-le.'}
            </>
          )}
        </p>
        <pre>{details}</pre>
        <p className="row wrap">
          <button className="btn primary" onClick={() => location.reload()}><Icone n="recharger" /> Recharger</button>
          <button className="btn" onClick={copier}><Icone n="copier" /> Copier le message</button>
        </p>
      </div>
    );
  }
}
