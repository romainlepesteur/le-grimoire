import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { Download, EllipsisVertical, ImagePlus, Plus, Share2, Trash2, Upload } from 'lucide-react';
import type { Campaign } from '@/domain/schemas';
import { canShareFiles, exportAndDeliver } from '@/features/backup/delivery';
import { useBackupImport } from '@/features/backup/useBackupImport';
import { useSettings } from '@/hooks/data';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import {
  campaignCoverImage,
  createCampaign,
  deleteCampaign,
  listCampaigns,
  removeCampaignCover,
  renameCampaign,
  setCampaignCover,
} from '@/services/db/campaigns';
import { db } from '@/services/db/database';
import { updateSettings } from '@/services/db/settings';
import { prepareImage } from '@/services/media/image';
import { audioEngine, useAudio } from '@/stores/audio';
import { useSession } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Field, TextInput } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';

/** Une couverture : format portrait 2:3, quatre de front sur une tablette en paysage. */
const TILE = 'relative aspect-[2/3] w-[clamp(176px,21.5vw,280px)] shrink-0';
const IMAGE_ACCEPT = 'image/webp,image/jpeg,image/png,image/avif';

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

function useCampaignSummary(campaign: Campaign) {
  return useLiveQuery(async () => {
    const [locations, characters, media] = await Promise.all([
      db.locations.where('campaignId').equals(campaign.id).count(),
      db.characters.where('campaignId').equals(campaign.id).count(),
      db.mediaMeta.where('campaignId').equals(campaign.id).count(),
    ]);
    return { locations, characters, media, coverImage: await campaignCoverImage(campaign) };
  }, [campaign.id, campaign.coverId, campaign.updatedAt]);
}

/** Couverture d'une campagne : image portrait, sinon une reliure de cuir à son nom. */
function Cover({ url, name }: { url: string | null; name: string }) {
  return url ? (
    <img
      src={url}
      alt=""
      draggable={false}
      className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
    />
  ) : (
    <span className="absolute inset-0 flex flex-col items-center gap-4 px-4 pt-[26%] tex-leather" title={name}>
      <img src="./icons/favicon.svg" alt="" className="w-2/5 opacity-80" draggable={false} />
      <span className="h-px w-1/3 bg-bronze-500/60" />
    </span>
  );
}

function CampaignCard({
  campaign,
  last,
  index,
  onOpen,
  onManage,
}: {
  campaign: Campaign;
  last: boolean;
  index: number;
  onOpen: () => void;
  onManage: () => void;
}) {
  const summary = useCampaignSummary(campaign);
  const url = useMediaUrl(summary?.coverImage);
  return (
    <motion.li
      className={TILE}
      initial={{ opacity: 0, transform: 'translateY(18px)' }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration: 0.5, delay: Math.min(index, 8) * 0.07, ease: EASE_OUT }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ouvrir ${campaign.name}`}
        className={cn(
          'group absolute inset-0 overflow-hidden rounded-xl bg-leather-900 text-left frame-gilt outline-none transition-transform duration-300 active:scale-[0.98]',
          'focus-visible:ring-2 focus-visible:ring-gold-300',
          last && 'shadow-[0_0_0_2px_rgb(227_194_122/0.55),0_18px_40px_-14px_rgb(0_0_0/0.9)]',
        )}
      >
        <Cover url={url} name={campaign.name} />
        {/* Voile sombre en bas : le titre reste lisible sur n'importe quelle image. */}
        <span className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-leather-950 via-leather-950/75 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 block px-4 pb-4">
          {(last || campaign.isDemo) && (
            <span className="mb-1.5 flex flex-wrap gap-1.5">
              {last && <Badge>Dernière partie</Badge>}
              {campaign.isDemo && <Badge tone="muted">Exemple</Badge>}
            </span>
          )}
          <span className="line-clamp-3 font-display text-lg font-semibold leading-snug tracking-wide text-gold-200 text-engraved">
            {campaign.name}
          </span>
          <span className="mt-1 block text-sm text-parchment-300">
            {summary
              ? `${plural(summary.locations, 'lieu', 'lieux')} · ${plural(summary.characters, 'fiche', 'fiches')}`
              : ' '}
          </span>
        </span>
      </button>
      <IconButton
        label={`Gérer ${campaign.name}`}
        onClick={onManage}
        className="absolute right-1.5 top-1.5 bg-leather-950/70 text-parchment-100 hover:bg-leather-950/90"
      >
        <EllipsisVertical className="size-5" />
      </IconButton>
    </motion.li>
  );
}

function ActionTile({ icon, label, hint, onClick, disabled }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void; disabled?: boolean }) {
  return (
    <li className="min-h-0 flex-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex size-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bronze-500/45 px-4 text-center text-parchment-300 outline-none transition-colors duration-300 hover:border-gold-300/70 hover:bg-parchment-100/5 hover:text-gold-200 focus-visible:ring-2 focus-visible:ring-gold-300 active:scale-[0.98] disabled:opacity-60"
      >
        {icon}
        <span className="font-display text-sm font-semibold uppercase tracking-[0.12em]">{label}</span>
        <span className="text-sm text-parchment-400">{hint}</span>
      </button>
    </li>
  );
}

/** Tiroir de gestion d'une campagne : couverture, nom, export, suppression. */
function ManageSheet({ campaign, onClose, onError }: { campaign: Campaign | null; onClose: () => void; onError: (e: unknown) => void }) {
  // Le contenu reste affiché pendant la fermeture du tiroir.
  const [shown, setShown] = useState<Campaign | null>(campaign);
  useEffect(() => {
    if (campaign) setShown(campaign);
  }, [campaign]);
  return (
    <Sheet open={!!campaign} onClose={onClose} title={shown?.name ?? ''} subtitle="Couverture, nom, sauvegarde">
      {shown && <ManageBody key={shown.id} campaign={shown} onClose={onClose} onError={onError} />}
    </Sheet>
  );
}

function ManageBody({ campaign, onClose, onError }: { campaign: Campaign; onClose: () => void; onError: (e: unknown) => void }) {
  const summary = useCampaignSummary(campaign);
  const url = useMediaUrl(summary?.coverImage);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(campaign.name);
  const [busy, setBusy] = useState<null | 'cover' | 'export' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setName(campaign.name), [campaign.name]);

  const pickCover = async (file: File) => {
    setBusy('cover');
    try {
      const img = await prepareImage(file, { maxEdge: 1400, targetBytes: 450 * 1024 });
      await setCampaignCover(campaign.id, img.blob, { width: img.width, height: img.height });
      toast({ tone: 'success', title: 'Couverture enregistrée' });
    } catch (e) {
      toast({ tone: 'error', title: 'Image refusée', message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    try {
      await renameCampaign(campaign.id, name);
      toast({ tone: 'success', title: 'Campagne renommée' });
    } catch (e) {
      toast({ tone: 'error', title: 'Nom invalide', message: (e as Error).message });
    }
  };

  const runExport = async (how: 'download' | 'share') => {
    setBusy('export');
    try {
      await exportAndDeliver(campaign.id, how);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    try {
      await deleteCampaign(campaign.id);
      setConfirmDelete(false);
      onClose();
      toast({ tone: 'success', title: 'Campagne supprimée', message: campaign.name });
    } catch (e) {
      setConfirmDelete(false);
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 px-5 py-5">
      <section>
        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">Couverture</p>
        <div className="flex gap-4">
          <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg bg-leather-900 frame-gilt">
            <Cover url={url} name={campaign.name} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-base text-parchment-300">
              Une image au format portrait (2:3), par exemple 1000 × 1500. Elle voyage avec la campagne dans ses
              sauvegardes.
            </p>
            {!campaign.coverId && summary?.coverImage && (
              <p className="text-sm italic text-parchment-400">Sans couverture, l’accueil montre une illustration de la campagne.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button icon={<ImagePlus className="size-5" />} disabled={!!busy} onClick={() => input.current?.click()}>
                {busy === 'cover' ? 'Import…' : campaign.coverId ? 'Changer l’image' : 'Choisir une image'}
              </Button>
              {campaign.coverId && (
                <Button variant="ghost" disabled={!!busy} onClick={() => void removeCampaignCover(campaign.id)}>
                  Retirer
                </Button>
              )}
            </div>
            <input
              ref={input}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              aria-label="Image de couverture"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void pickCover(f);
              }}
            />
          </div>
        </div>
      </section>

      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <Field label="Nom de la campagne" className="min-w-0 flex-1">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </Field>
        <Button type="submit" disabled={!name.trim() || name.trim() === campaign.name}>
          Renommer
        </Button>
      </form>

      <section>
        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">Sauvegarde</p>
        <p className="mb-3 text-base text-parchment-300">
          {summary ? `${plural(summary.locations, 'lieu', 'lieux')}, ${plural(summary.characters, 'fiche', 'fiches')}, ${plural(summary.media, 'média', 'médias')}. ` : ''}
          L’archive contient toute la campagne : elle sert de sauvegarde et de pack à importer sur un autre appareil.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Download className="size-5" />} disabled={!!busy} onClick={() => void runExport('download')}>
            {busy === 'export' ? 'Préparation…' : 'Exporter'}
          </Button>
          {canShareFiles && (
            <Button icon={<Share2 className="size-5" />} disabled={!!busy} onClick={() => void runExport('share')}>
              Envoyer vers…
            </Button>
          )}
        </div>
      </section>

      <section className="border-t border-bronze-500/25 pt-5">
        <Button variant="danger" icon={<Trash2 className="size-5" />} disabled={!!busy} onClick={() => setConfirmDelete(true)}>
          Supprimer la campagne
        </Button>
      </section>

      <Dialog
        open={confirmDelete}
        onClose={() => busy !== 'delete' && setConfirmDelete(false)}
        title={`Supprimer « ${campaign.name} » ?`}
        actions={
          <>
            <Button variant="ink" disabled={busy === 'delete'} onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
            <Button variant="ink" disabled={!!busy} onClick={() => void runExport('download')}>
              Exporter d’abord
            </Button>
            <Button variant="danger" disabled={!!busy} onClick={() => void remove()}>
              {busy === 'delete' ? 'Suppression…' : 'Supprimer'}
            </Button>
          </>
        }
      >
        <p>
          La campagne et tout son contenu seront effacés de cet appareil : lieux, cartes, illustrations, sons, fiches,
          inventaire et journal.
        </p>
        <p className="mt-2 font-semibold text-blood-600">Cette action est définitive. Sans export, rien ne pourra être récupéré.</p>
      </Dialog>
    </div>
  );
}

/**
 * Accueil : la bibliothèque des campagnes présentes sur l'appareil.
 * On y choisit la campagne à ouvrir, on y importe un pack et on y crée une campagne.
 */
export function HomePage() {
  const campaigns = useLiveQuery(() => listCampaigns(), []);
  const settings = useSettings();
  const setCampaignId = useSession((s) => s.setCampaignId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const imp = useBackupImport({
    addedText: 'Elle sera ajoutée à vos campagnes sur cet appareil.',
    onImported: () => undefined,
  });

  // En quittant une campagne, son ambiance sonore s'arrête.
  useEffect(() => {
    audioEngine.play(null);
    useAudio.setState({ override: null, nowPlaying: null });
  }, []);

  const open = async (id: string) => {
    await updateSettings({ activeCampaignId: id });
    window.location.hash = '#/';
    setCampaignId(id);
  };

  const create = async () => {
    try {
      const c = await createCampaign(newName);
      setCreating(false);
      setNewName('');
      toast({ tone: 'success', title: 'Campagne créée', message: 'Passez en mode Préparation pour créer son premier lieu.' });
      await open(c.id);
    } catch (e) {
      toast({ tone: 'error', title: 'Création impossible', message: (e as Error).message });
    }
  };

  const last = settings.activeCampaignId;
  const sorted = [...(campaigns ?? [])].sort((a, b) => Number(b.id === last) - Number(a.id === last) || b.updatedAt - a.updatedAt);
  const managed = sorted.find((c) => c.id === managing) ?? null;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden tex-leather">
      <header
        className="flex shrink-0 items-center gap-4 border-b border-bronze-500/25 px-8 pb-4 tex-wood"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <img src="./icons/favicon.svg" alt="" className="size-12 animate-compass-in drop-shadow" />
        <div className="min-w-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze-400">Le Grimoire</p>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-gold-200 text-engraved">Vos campagnes</h1>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {campaigns && (
          <ul className="mx-auto flex min-h-full max-w-[1400px] flex-wrap content-center justify-center gap-7 px-8 py-6">
            {sorted.map((c, i) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                index={i}
                last={c.id === last && sorted.length > 1}
                onOpen={() => void open(c.id)}
                onManage={() => setManaging(c.id)}
              />
            ))}
            <li className={TILE}>
              <ul className="absolute inset-0 flex flex-col gap-5">
            <ActionTile
              icon={<Upload className="size-8" strokeWidth={1.4} />}
              label={imp.busy === 'read' ? 'Vérification…' : 'Importer un pack'}
              hint="Une campagne complète, ou une sauvegarde (.zip)"
              disabled={!!imp.busy}
              onClick={() => fileInput.current?.click()}
            />
            <ActionTile
              icon={<Plus className="size-8" strokeWidth={1.4} />}
              label="Nouvelle campagne"
              hint="Vide, à construire en mode Préparation"
              onClick={() => setCreating(true)}
            />
              </ul>
            </li>
          </ul>
        )}
        {campaigns?.length === 0 && (
          <p className="px-8 pb-8 text-center text-lg italic text-parchment-400">
            Aucune campagne sur cet appareil. Importez un pack ou créez-en une.
          </p>
        )}
      </main>

      <footer className="shrink-0 px-8 pb-3 pt-1 text-center text-sm text-parchment-400/80">Version {__APP_VERSION__}</footer>

      <input
        ref={fileInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-label="Fichier du pack à importer"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void imp.pick(f);
        }}
      />

      <ManageSheet campaign={managed} onClose={() => setManaging(null)} onError={imp.showError} />

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Nouvelle campagne"
        actions={
          <>
            <Button variant="ink" onClick={() => setCreating(false)}>
              Annuler
            </Button>
            <Button variant="primary" disabled={!newName.trim()} onClick={() => void create()}>
              Créer
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) void create();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-base text-ink-700">Nom de la campagne</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={200}
              autoFocus
              className="h-12 w-full rounded-md border border-ink-700/30 bg-parchment-50/70 px-3 text-lg text-ink-900 outline-none focus:border-bronze-600"
            />
          </label>
          <p className="mt-3 text-base text-ink-500">
            Elle démarre vide, avec les règles par défaut. Vous créerez ses lieux, ses cartes et ses ambiances en mode
            Préparation.
          </p>
        </form>
      </Dialog>

      {imp.dialogs}
    </div>
  );
}
