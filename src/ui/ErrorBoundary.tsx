import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { Panel } from './Panel';

/**
 * Filet de sécurité : si un écran plante, seul cet écran affiche un message ;
 * la navigation, les dés et l'ajout rapide restent utilisables, et aucune donnée n'est touchée.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Écran en erreur :', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Panel ornate className="max-w-lg px-8 py-7">
          <h1 className="font-display text-xl font-semibold text-ink-900">Cet écran a rencontré un problème</h1>
          <p className="mt-2 text-lg text-ink-700">
            Vos données ne sont pas touchées. Vous pouvez continuer à jouer depuis les autres écrans, ou recharger
            l’application.
          </p>
          <p className="mt-3 rounded-md bg-ink-900/5 px-3 py-2 font-mono text-sm text-ink-500">{this.state.error.message}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button variant="ink" onClick={() => (window.location.hash = '#/')}>
              Revenir à l’Exploration
            </Button>
            <Button variant="primary" onClick={() => window.location.reload()}>
              Recharger
            </Button>
          </div>
        </Panel>
      </div>
    );
  }
}
