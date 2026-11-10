// @vitest-environment jsdom
/**
 * Tests de bout en bout de l'interface : l'application complète est affichée (React, routes,
 * base de données locale simulée) et pilotée comme par un joueur, au clavier et à la souris.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MotionGlobalConfig } from 'motion/react';
import { App } from '@/app/App';
import { db } from '@/services/db/database';
import { updateSettings } from '@/services/db/settings';
import { useSession } from '@/stores/session';

beforeAll(() => {
  // Animations instantanées : on teste le comportement, pas les fondus.
  MotionGlobalConfig.skipAnimations = true;
  // API du navigateur absentes de l'environnement de test.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(async () => {
  window.location.hash = '#/';
  useSession.setState({ mode: 'jeu', quickOpen: false, diceOpen: false, immersive: false });
  await db.open();
  await updateSettings({ storageNoticeSeen: true, ambientEffects: false, wakeLock: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function startApp() {
  const user = userEvent.setup();
  render(<App />);
  // L'Exploration s'affiche sur le lieu courant de la campagne d'exemple.
  await screen.findByRole('button', { name: 'Changer de lieu' }, { timeout: 5000 });
  return user;
}

describe('partie (mode Jeu)', () => {
  it('démarre en mode Jeu : le monde se consulte mais ne se modifie pas', async () => {
    await startApp();
    expect(screen.getAllByText('Auberge du Cerf d’Argent').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Modifier ce lieu' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Passer en mode Préparation' })).toBeTruthy();
  });

  it('« ajoute une vieille clé à ton inventaire » : touche N, saisie, Entrée', async () => {
    const user = await startApp();
    await user.keyboard('n');
    const input = await screen.findByRole('textbox', { name: 'Objet à ajouter' });
    await user.type(input, 'une vieille clé{Enter}');
    await screen.findByText('Ajouté : Vieille clé');
    const items = await db.items.toArray();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Vieille clé', quantity: 1, category: 'cle' });
    // Le lieu de découverte est le lieu courant.
    expect(items[0].foundAtId).toBe((await db.campaigns.toArray())[0].currentLocationId);
  });

  it('crée un personnage puis fait un jet de compétence contre une difficulté', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('link', { name: /Fiches/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Nom du personnage' }, { timeout: 5000 }), 'Aldric{Enter}');
    await user.click(await screen.findByRole('tab', { name: /Compét/ }));
    await user.click(await screen.findByTitle('Jet de Perception'));
    const dialog = await screen.findByRole('dialog', { name: 'Jet : Perception' });
    await user.click(within(dialog).getByRole('button', { name: /^15/ }));
    await user.click(within(dialog).getByRole('button', { name: /Lancer 1d20/ }));
    await within(dialog).findByText(/Réussite|Échec/);

    const [roll] = await db.diceRolls.toArray();
    expect(roll).toMatchObject({ dc: 15, label: 'Perception' });
    expect(roll.characterId).toBe((await db.characters.toArray())[0].id);
    expect(roll.outcome).toBe(roll.total >= 15 ? 'reussite' : 'echec');
    expect(roll.breakdown[0]).toEqual({ label: 'Sagesse', value: 0 });
  });

  it('les points de vie se modifient en jeu, d’un toucher', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('link', { name: /Fiches/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Nom du personnage' }, { timeout: 5000 }), 'Aldric{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Perdre 5 points de vie' }));
    await waitFor(async () => expect((await db.characters.toArray())[0].hpCurrent).toBe(5));
  });
});

describe('préparation', () => {
  it('passer en Préparation demande une confirmation, puis donne accès à l’édition du monde', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('button', { name: 'Passer en mode Préparation' }));
    const confirm = await screen.findByRole('alertdialog');
    expect(screen.queryByRole('button', { name: 'Modifier ce lieu' })).toBeNull();
    await user.click(within(confirm).getByRole('button', { name: 'Passer en Préparation' }));
    expect(await screen.findByRole('button', { name: 'Modifier ce lieu' })).toBeTruthy();
    expect(useSession.getState().mode).toBe('preparation');
  });
});
