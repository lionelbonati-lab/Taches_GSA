import { Component, type ErrorInfo, type ReactNode } from 'react';

// Une erreur pendant l'affichage : un message lisible (à copier pour le signaler) au lieu d'un écran blanc.
// « page » : seule la page est remplacée, les menus restent utilisables ; le message disparaît en changeant de page.

type Props = { children: ReactNode; page?: string };
type State = { error: Error | null; where: string; page?: string };

const court = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim().replace(/https?:\/\/[^\s)]*\/assets\//g, ''))
    .filter(Boolean)
    .slice(0, 8)
    .join('\n');

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, where: '', page: this.props.page };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.page !== state.page ? { error: null, where: '', page: props.page } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ where: info.componentStack ?? '' });
  }

  render() {
    const { error, where } = this.state;
    if (!error) return this.props.children;
    const details = [
      `${error.name}: ${error.message}`,
      `Page : ${location.hash || '#/'}`,
      `Appareil : ${navigator.userAgent}`,
      court(error.stack ?? ''),
      court(where),
    ].join('\n\n');
    const copier = () => void navigator.clipboard?.writeText(details).catch(() => {});
    return (
      <div className="panel erreur-appli" role="alert">
        <h2>😕 Oups, un problème d’affichage</h2>
        <p>
          {this.props.page !== undefined
            ? 'Cette page n’a pas pu s’afficher. Les menus restent utilisables ; tu peux aussi recharger.'
            : 'L’application n’a pas pu s’afficher. Recharge la page.'}{' '}
          Pour qu’on corrige, copie le message ci-dessous et envoie-le.
        </p>
        <pre>{details}</pre>
        <p className="row wrap">
          <button className="btn primary" onClick={() => location.reload()}>🔄 Recharger</button>
          <button className="btn" onClick={copier}>📋 Copier le message</button>
        </p>
      </div>
    );
  }
}
