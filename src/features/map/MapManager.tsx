import { useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import type { GameMap } from '@/domain/schemas';
import { createMap, deleteMap, renameMap, replaceMapImage, setCurrentMap } from '@/services/db/maps';
import { MAP_MAX_EDGE, MAP_TARGET_BYTES, prepareImage } from '@/services/media/image';
import { formatBytes } from '@/services/storage';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Field, TextInput } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';
import { cn } from '@/ui/cn';

export const MAP_ACCEPT = 'image/webp,image/jpeg,image/png,image/avif';

export async function prepareMapImage(file: File) {
  const img = await prepareImage(file, { maxEdge: MAP_MAX_EDGE, targetBytes: MAP_TARGET_BYTES });
  return { blob: img.blob, width: img.width, height: img.height, originalSize: img.originalSize, converted: img.converted };
}

function nameFromFile(file: File) {
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Carte';
}

/** Import d'une nouvelle carte : choix du fichier puis du nom. Utilisé aussi pour la première carte. */
export function NewMapForm({ campaignId, onDone, compact }: { campaignId: string; onDone?: () => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await prepareMapImage(file);
      await createMap(campaignId, name || nameFromFile(file), img);
      toast({
        tone: 'success',
        title: 'Carte ajoutée',
        message: `${img.width} × ${img.height} · ${formatBytes(img.blob.size)}. Le brouillard couvre tout : révélez au pinceau.`,
      });
      setFile(null);
      setName('');
      onDone?.();
    } catch (e) {
      toast({ tone: 'error', title: 'Carte refusée', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('space-y-3', compact && 'rounded-lg border border-bronze-500/30 bg-leather-950/40 p-3')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<Upload className="size-5" />} onClick={() => input.current?.click()} disabled={busy}>
          {file ? 'Choisir une autre image' : 'Choisir l’image de la carte'}
        </Button>
        {file && <span className="min-w-0 truncate text-base text-parchment-300">{file.name}</span>}
      </div>
      {file && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nom de la carte" className="min-w-48 flex-1">
            <TextInput value={name} placeholder={nameFromFile(file)} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="primary" onClick={() => void create()} disabled={busy} icon={busy ? <Loader2 className="size-5 animate-spin" /> : undefined}>
            {busy ? 'Préparation…' : 'Ajouter la carte'}
          </Button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept={MAP_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
    </div>
  );
}

function MapRow({ map, current, campaignId }: { map: GameMap; current: boolean; campaignId: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(map.name);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2',
        current ? 'border-gold-300/50 bg-gold-300/10' : 'border-bronze-500/25',
      )}
    >
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void renameMap(map.id, name)
              .then(() => setEditing(false))
              .catch((err: Error) => toast({ tone: 'error', title: err.message }));
          }}
        >
          <TextInput autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-label="Nom de la carte" />
          <IconButton label="Valider" type="submit">
            <Check className="size-5" />
          </IconButton>
        </form>
      ) : (
        <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => void setCurrentMap(campaignId, map.id)}>
          <span className={cn('block truncate text-lg', current ? 'text-gold-200' : 'text-parchment-50')}>{map.name}</span>
          <span className="text-sm text-parchment-400">
            {map.width} × {map.height}
            {current && ' · affichée'}
          </span>
        </button>
      )}
      {!editing && (
        <>
          <IconButton label="Renommer" onClick={() => setEditing(true)}>
            <Pencil className="size-5" />
          </IconButton>
          <IconButton label="Remplacer l’image (les marqueurs suivent)" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          </IconButton>
          <IconButton label="Supprimer la carte" onClick={() => setConfirm(true)} className="hover:text-blood-500">
            <Trash2 className="size-5" />
          </IconButton>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept={MAP_ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          void prepareMapImage(f)
            .then((img) => replaceMapImage(map.id, img))
            .then(() => toast({ tone: 'success', title: 'Image de la carte remplacée' }))
            .catch((err: Error) => toast({ tone: 'error', title: 'Image refusée', message: err.message }))
            .finally(() => setBusy(false));
        }}
      />
      <ConfirmDialog
        open={confirm}
        danger
        title={`Supprimer la carte « ${map.name} » ?`}
        message="Ses marqueurs et son brouillard seront effacés. Les lieux eux-mêmes sont conservés. Action définitive."
        confirmLabel="Supprimer la carte"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void deleteMap(map.id).then(() => toast({ tone: 'success', title: 'Carte supprimée' }));
        }}
      />
    </li>
  );
}

/** Gestion des cartes de la campagne (mode Préparation). */
export function MapManager({
  open,
  onClose,
  campaignId,
  maps,
  currentMapId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  maps: GameMap[];
  currentMapId: string | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Cartes de la campagne" subtitle="Carte du monde, d’une région, plan d’une ville…">
      <div className="space-y-5 px-5 py-4">
        <section>
          <SectionTitle className="text-bronze-400">Cartes ({maps.length})</SectionTitle>
          <ul className="mt-2 space-y-2">
            {maps.map((m) => (
              <MapRow key={m.id} map={m} current={m.id === currentMapId} campaignId={campaignId} />
            ))}
          </ul>
        </section>
        <section>
          <SectionTitle className="text-bronze-400">Ajouter une carte</SectionTitle>
          <p className="mb-2 mt-1 text-base text-parchment-400">
            WebP, JPEG ou PNG. L’image est optimisée (4096 px au plus) et reste sur l’appareil.
          </p>
          <NewMapForm campaignId={campaignId} compact />
        </section>
      </div>
    </Sheet>
  );
}
