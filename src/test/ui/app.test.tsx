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
  // Lecture d'un fichier (import d'un pack) : absente des fichiers simulés.
  const read = (blob: Blob, how: 'readAsArrayBuffer' | 'readAsText') =>
    new Promise<never>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as never);
      reader.onerror = () => reject(reader.error);
      reader[how](blob);
    });
  Blob.prototype.arrayBuffer ??= function (this: Blob) {
    return read(this, 'readAsArrayBuffer');
  };
  Blob.prototype.text ??= function (this: Blob) {
    return read(this, 'readAsText');
  };
});

beforeEach(async () => {
  window.location.hash = '#/';
  useSession.setState({ campaignId: null, mode: 'jeu', quickOpen: false, diceOpen: false, immersive: false });
  await db.open();
  await updateSettings({ storageNoticeSeen: true, ambientEffects: false, wakeLock: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Ouvre l'application : elle s'arrête sur l'accueil des campagnes. */
async function startHome() {
  const user = userEvent.setup();
  // Comme la vraie page : l'application est montée dans #root (rendu inerte sous une fenêtre).
  document.getElementById('root')?.remove();
  const root = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }));
  render(<App />, { container: root });
  return user;
}

/** Ouvre l'application puis la campagne d'exemple depuis l'accueil. */
async function startApp() {
  const user = await startHome();
  await user.click(await screen.findByRole('button', { name: /^Ouvrir Valdoren/ }, { timeout: 5000 }));
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

  it('« Relancer le dernier » refait un jet de fiche relancé par la chance (régression)', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('link', { name: /Fiches/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Nom du personnage' }, { timeout: 5000 }), 'Aldric{Enter}');
    await user.click(await screen.findByTitle('Jet de Force'));
    const dialog = await screen.findByRole('dialog', { name: 'Jet : Force' });
    await user.click(within(dialog).getByRole('button', { name: /^15/ }));
    await user.click(within(dialog).getByRole('button', { name: /Lancer 1d20/ }));
    await user.click(await within(dialog).findByRole('button', { name: /Relancer avec la chance/ }));
    await waitFor(async () => expect(await db.diceRolls.count()).toBe(2));
    await user.keyboard('{Escape}');

    await user.keyboard('d');
    await user.click(await screen.findByRole('button', { name: 'Relancer le dernier' }));
    await waitFor(async () => expect(await db.diceRolls.count()).toBe(3));
    const last = (await db.diceRolls.orderBy('createdAt').toArray()).at(-1)!;
    expect(last).toMatchObject({ label: 'Force', dc: 15, luckReroll: false });
    expect(last.characterId).toBe((await db.characters.toArray())[0].id);
    expect(last.formula).toMatch(/^Aldric — Force : 1d20/);
  });

  it('les points de vie se modifient en jeu, d’un toucher', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('link', { name: /Fiches/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Nom du personnage' }, { timeout: 5000 }), 'Aldric{Enter}');
    await user.click(await screen.findByRole('button', { name: 'Perdre 5 points de vie' }));
    await waitFor(async () => expect((await db.characters.toArray())[0].hpCurrent).toBe(5));
  });
});

describe('fenêtres (régression)', () => {
  it('le focus reste dans la fenêtre de jet, le fond est inerte, Échap rend la main', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('link', { name: /Fiches/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Nom du personnage' }, { timeout: 5000 }), 'Aldric{Enter}');
    await user.click(await screen.findByRole('tab', { name: /Compét/ }));
    const opener = await screen.findByTitle('Jet de Perception');
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Jet : Perception' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.getElementById('root')!.inert).toBe(true);
    // Une vingtaine de Tab : le focus ne passe jamais derrière la fenêtre.
    for (let i = 0; i < 20; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Jet : Perception' })).toBeNull());
    expect(document.getElementById('root')!.inert).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('Échap ne ferme que la fenêtre du dessus', async () => {
    const user = await startApp();
    await user.click(screen.getByRole('button', { name: 'Passer en mode Préparation' }));
    await user.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Passer en Préparation' }));
    await user.click(await screen.findByRole('button', { name: 'Modifier ce lieu' }));
    const sheet = await screen.findByRole('dialog', { name: /Modifier/ });
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer' }));
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    // Le tiroir d'édition, en dessous, est toujours ouvert.
    expect(screen.getByRole('dialog', { name: /Modifier/ })).toBeTruthy();
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

describe('accueil des campagnes', () => {
  it('s’ouvre sur l’accueil ; une campagne s’ouvre d’un toucher et l’emblème y ramène', async () => {
    const user = await startHome();
    await screen.findByRole('heading', { name: 'Vos campagnes' }, { timeout: 5000 });
    // Aucune campagne n'est ouverte d'office.
    expect(screen.queryByRole('button', { name: 'Changer de lieu' })).toBeNull();
    expect(await screen.findByRole('button', { name: /Importer un pack/ })).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: /^Ouvrir Valdoren/ }));
    await screen.findByRole('button', { name: 'Changer de lieu' }, { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'Passer en mode Préparation' }));
    await user.click(await within(await screen.findByRole('alertdialog')).findByRole('button', { name: 'Passer en Préparation' }));
    await user.click(screen.getByRole('button', { name: 'Changer de campagne' }));
    await screen.findByRole('heading', { name: 'Vos campagnes' });
    // Revenir à l'accueil repasse en mode Jeu : la campagne suivante s'ouvre protégée.
    expect(useSession.getState().mode).toBe('jeu');
  });

  it('crée une campagne, la retrouve sur l’accueil, puis la supprime après confirmation', async () => {
    const user = await startHome();
    await user.click(await screen.findByRole('button', { name: /Nouvelle campagne/ }, { timeout: 5000 }));
    const dialog = await screen.findByRole('alertdialog');
    await user.type(within(dialog).getByRole('textbox'), 'Les Terres du Nord');
    await user.click(within(dialog).getByRole('button', { name: 'Créer' }));
    // Elle s'ouvre aussitôt, vide.
    await screen.findByText('Aucun lieu sélectionné', {}, { timeout: 5000 });
    expect(await db.campaigns.count()).toBe(2);

    await user.click(screen.getByRole('button', { name: 'Changer de campagne' }));
    await user.click(await screen.findByRole('button', { name: 'Gérer Les Terres du Nord' }));
    const sheet = await screen.findByRole('dialog', { name: 'Les Terres du Nord' });
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer la campagne' }));
    const confirm = await screen.findByRole('alertdialog');
    // Rien n'est supprimé avant la confirmation.
    expect(await db.campaigns.count()).toBe(2);
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }));
    await waitFor(async () => expect(await db.campaigns.count()).toBe(1));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Ouvrir Les Terres/ })).toBeNull());
    expect(screen.getByRole('button', { name: /^Ouvrir Valdoren/ })).toBeTruthy();
  });

  it('importe un pack depuis l’accueil, sans ouvrir de campagne', async () => {
    // Un pack : une campagne exportée ailleurs, absente de cet appareil.
    const { createCampaign, deleteCampaign } = await import('@/services/db/campaigns');
    const { exportCampaign } = await import('@/services/backup/exportCampaign');
    const pack = await createCampaign('Les Îles de Brume');
    const { blob, filename } = await exportCampaign(pack.id);
    await deleteCampaign(pack.id);

    const user = await startHome();
    await screen.findByRole('heading', { name: 'Vos campagnes' }, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /^Ouvrir Les Îles/ })).toBeNull();
    await user.upload(screen.getByLabelText('Fichier du pack à importer'), new File([blob], filename, { type: 'application/zip' }));
    const preview = await screen.findByRole('alertdialog', {}, { timeout: 5000 });
    expect(within(preview).getByText('Les Îles de Brume')).toBeTruthy();
    await user.click(within(preview).getByRole('button', { name: 'Importer' }));
    // La campagne rejoint l'accueil ; on y reste.
    await screen.findByRole('button', { name: /^Ouvrir Les Îles de Brume/ }, { timeout: 5000 });
    expect(screen.getByRole('heading', { name: 'Vos campagnes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Changer de lieu' })).toBeNull();
  });
});
