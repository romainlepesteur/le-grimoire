import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ImagePlus, Loader2, Map as MapIcon, Trash2, X } from 'lucide-react';
import { allowedParents, canBeRoot, defaultKindForParent, depthOf, descendantIds } from '@/domain/locationTree';
import {
  LOCATION_KIND_LABELS,
  LOCATION_KINDS,
  PLACEHOLDER_THEMES,
  THEME_LABELS,
  type Location,
  type LocationKind,
  type PlaceholderTheme,
} from '@/domain/schemas';
import { useCampaignLocations } from '@/hooks/data';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { useCampaignAmbiances } from '@/features/audio/useAmbianceDirector';
import { deleteLocation, saveLocation, sortLocations } from '@/services/db/locations';
import { addMedia, deleteMediaIfUnused } from '@/services/db/media';
import { prepareImage, type PreparedImage } from '@/services/media/image';
import { formatBytes } from '@/services/storage';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { EmptyIllustration } from '@/ui/EmptyIllustration';
import { Field, Select, TextArea, TextInput } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { EASE_OUT } from '@/ui/motion';

export interface LocationEditorTarget {
  /** null : nouveau lieu. */
  id: string | null;
  parentId?: string | null;
}

interface Draft {
  name: string;
  kind: LocationKind;
  parentId: string | null;
  description: string;
  theme: PlaceholderTheme;
  ambianceId: string | null;
  /** Image enregistrée (existante) ; remplacée par `newImage` si une nouvelle est choisie. */
  imageId: string | null;
}

function ImagePreview({ imageId, prepared, theme }: { imageId: string | null; prepared: PreparedImage | null; theme: PlaceholderTheme }) {
  const stored = useMediaUrl(prepared ? null : imageId);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!prepared) return setDraftUrl(null);
    const u = URL.createObjectURL(prepared.blob);
    setDraftUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [prepared]);
  const url = draftUrl ?? stored;
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-bronze-500/40 bg-leather-950">
      <AnimatePresence initial={false}>
        <motion.div
          key={url ?? `empty-${theme}`}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {url ? (
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <EmptyIllustration theme={theme} showHint={false} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * Création et modification d'un lieu (mode Préparation uniquement) :
 * nom, place dans la hiérarchie, description, illustration, ambiance sonore.
 */
export function LocationEditor({
  campaignId,
  target,
  onClose,
}: {
  campaignId: string;
  target: LocationEditorTarget | null;
  onClose: () => void;
}) {
  const all = useCampaignLocations(campaignId) ?? [];
  const ambiances = useCampaignAmbiances(campaignId) ?? [];
  const navigate = useNavigate();
  const existing = target?.id ? all.find((l) => l.id === target.id) : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Initialisation à l'ouverture (et seulement à l'ouverture).
  const openKey = target ? `${target.id ?? 'new'}:${target.parentId ?? ''}` : null;
  useEffect(() => {
    if (!target) return;
    setPrepared(null);
    if (target.id) {
      const l = all.find((x) => x.id === target.id);
      if (!l) return;
      setDraft({
        name: l.name,
        kind: l.kind,
        parentId: l.parentId,
        description: l.description,
        theme: l.theme,
        ambianceId: l.ambianceId,
        imageId: l.imageId,
      });
    } else {
      const parentId = target.parentId ?? null;
      const parent = all.find((x) => x.id === parentId);
      setDraft({
        name: '',
        kind: defaultKindForParent(parentId, all),
        parentId,
        description: '',
        theme: parent?.theme ?? 'autre',
        ambianceId: null,
        imageId: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, all.length > 0]);

  const parents = useMemo(() => {
    const allowed = allowedParents(target?.id ?? null, all);
    const byId = new Map(all.map((l) => [l.id, l]));
    const label = (l: Location) => (l.parentId && byId.get(l.parentId) ? `${byId.get(l.parentId)!.name} › ${l.name}` : l.name);
    // Ordre de lecture : chaque région suivie de ses zones.
    const roots = sortLocations(allowed.filter((l) => depthOf(l.id, all) === 0));
    const out: { id: string; label: string; depth: number }[] = [];
    for (const r of roots) {
      out.push({ id: r.id, label: label(r), depth: 0 });
      for (const c of sortLocations(allowed.filter((l) => l.parentId === r.id))) out.push({ id: c.id, label: label(c), depth: 1 });
    }
    return out;
  }, [all, target?.id]);

  const rootAllowed = canBeRoot(target?.id ?? null, all);
  const subCount = target?.id ? descendantIds(target.id, all).length : 0;
  const parentChain = (() => {
    const names: string[] = [];
    let p = draft?.parentId ? all.find((l) => l.id === draft.parentId) : undefined;
    while (p) {
      names.unshift(p.name);
      p = p.parentId ? all.find((l) => l.id === p!.parentId) : undefined;
    }
    return names;
  })();
  const inherited = (() => {
    let p = draft?.parentId ? all.find((l) => l.id === draft.parentId) : undefined;
    while (p) {
      if (p.ambianceId) return { from: p.name, name: ambiances.find((a) => a.id === p!.ambianceId)?.name ?? '?' };
      p = p.parentId ? all.find((l) => l.id === p!.parentId) : undefined;
    }
    return null;
  })();

  const pickImage = async (file: File) => {
    setProcessing(true);
    try {
      const img = await prepareImage(file);
      setPrepared(img);
    } catch (e) {
      toast({ tone: 'error', title: 'Image refusée', message: (e as Error).message });
    } finally {
      setProcessing(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast({ tone: 'warning', title: 'Donnez un nom au lieu' });
      return;
    }
    setSaving(true);
    let addedImage: string | null = null;
    try {
      let imageId = draft.imageId;
      if (prepared) {
        const meta = await addMedia(campaignId, prepared.blob, 'image', {
          width: prepared.width,
          height: prepared.height,
          name: `Illustration — ${draft.name.trim()}`,
        });
        imageId = addedImage = meta.id;
      }
      const saved = await saveLocation(campaignId, target?.id ?? null, { ...draft, imageId });
      toast({ tone: 'success', title: target?.id ? 'Lieu enregistré' : `Lieu créé : ${saved.name}` });
      onClose();
    } catch (e) {
      if (addedImage) await deleteMediaIfUnused(addedImage);
      toast({ tone: 'error', title: 'Enregistrement impossible', message: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const isNew = !target?.id;

  return (
    <Sheet
      open={!!target && !!draft}
      onClose={onClose}
      title={isNew ? 'Nouveau lieu' : `Modifier « ${existing?.name ?? ''} »`}
      subtitle={parentChain.length ? `Dans : ${parentChain.join(' › ')}` : 'Région (premier niveau)'}
      sizeClass="w-[min(760px,96vw)]"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {!isNew && (
            <Button variant="ghost" icon={<Trash2 className="size-5" />} className="hover:text-blood-500" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving || processing}>
            {saving ? 'Enregistrement…' : isNew ? 'Créer le lieu' : 'Enregistrer'}
          </Button>
        </div>
      }
    >
      {draft && (
        <motion.div
          className="grid gap-5 px-5 py-4 md:grid-cols-[1fr_1fr]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1, ease: EASE_OUT }}
        >
          {/* Colonne gauche : identité */}
          <div className="space-y-4">
            <Field label="Nom">
              <TextInput
                autoFocus={isNew}
                value={draft.name}
                maxLength={200}
                placeholder="Ex. : Le Gué aux Saules"
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <Select value={draft.kind} onChange={(e) => set('kind', e.target.value as LocationKind)}>
                  {LOCATION_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {LOCATION_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situé dans">
                <Select
                  value={draft.parentId ?? ''}
                  onChange={(e) => {
                    const parentId = e.target.value || null;
                    setDraft((d) => (d ? { ...d, parentId, kind: isNew ? defaultKindForParent(parentId, all) : d.kind } : d));
                  }}
                >
                  {rootAllowed && <option value="">— Aucun (région) —</option>}
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.depth ? '   ' : ''}
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Description" hint="Ce que vous savez du lieu. Visible en mode Jeu, sur le panneau du lieu.">
              <TextArea
                value={draft.description}
                maxLength={5000}
                rows={6}
                placeholder="Ce que le personnage voit, entend, sait de ce lieu…"
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>
          </div>

          {/* Colonne droite : illustration et ambiance */}
          <div className="space-y-4">
            <div>
              <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-400">
                Illustration
              </span>
              <div className="relative">
                <ImagePreview imageId={draft.imageId} prepared={prepared} theme={draft.theme} />
                {processing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-leather-950/70 text-parchment-200">
                    <Loader2 className="mr-2 size-6 animate-spin" /> Préparation de l’image…
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" icon={<ImagePlus className="size-5" />} onClick={() => fileInput.current?.click()} disabled={processing}>
                  {draft.imageId || prepared ? 'Changer l’illustration' : 'Importer une illustration'}
                </Button>
                {(draft.imageId || prepared) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-5" />}
                    onClick={() => {
                      if (prepared) setPrepared(null);
                      else set('imageId', null);
                    }}
                  >
                    {prepared ? 'Annuler ce choix' : 'Retirer'}
                  </Button>
                )}
              </div>
              <p className="mt-1 text-sm text-parchment-400">
                {prepared
                  ? `${prepared.width} × ${prepared.height} · ${formatBytes(prepared.blob.size)}${
                      prepared.converted ? ` (optimisée, au lieu de ${formatBytes(prepared.originalSize)})` : ''
                    }`
                  : 'Paysage 16:9 conseillé. L’image est optimisée et reste sur l’appareil.'}
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="image/webp,image/jpeg,image/png,image/avif"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void pickImage(f);
                }}
              />
            </div>

            {!draft.imageId && !prepared && (
              <Field label="Teinte du cadre sans image">
                <Select value={draft.theme} onChange={(e) => set('theme', e.target.value as PlaceholderTheme)}>
                  {PLACEHOLDER_THEMES.map((t) => (
                    <option key={t} value={t}>
                      {THEME_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label="Ambiance sonore"
              hint={
                <>
                  Jouée automatiquement en arrivant dans ce lieu.{' '}
                  <button
                    type="button"
                    className="text-gold-300 underline underline-offset-2"
                    onClick={() => {
                      onClose();
                      navigate('/ambiances');
                    }}
                  >
                    Gérer les ambiances
                  </button>
                </>
              }
            >
              <Select value={draft.ambianceId ?? ''} onChange={(e) => set('ambianceId', e.target.value || null)}>
                <option value="">{inherited ? `Celle de ${inherited.from} (${inherited.name})` : 'Aucune (silence)'}</option>
                {[...ambiances]
                  .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.category}
                    </option>
                  ))}
              </Select>
            </Field>

            <div className="flex items-start gap-3 rounded-lg border border-dashed border-bronze-500/30 px-3 py-2.5 text-sm text-parchment-400">
              <MapIcon className="mt-0.5 size-5 shrink-0" />
              <span>Le placement de ce lieu sur la carte arrive en phase 3, depuis l’écran Carte.</span>
            </div>
          </div>
        </motion.div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Supprimer « ${existing?.name ?? ''} » ?`}
        message={
          <>
            {subCount > 0 && (
              <>
                Ses <strong>{subCount} sous-lieu{subCount > 1 ? 'x' : ''}</strong> seront aussi supprimés.{' '}
              </>
            )}
            Les illustrations qui ne servent plus ailleurs seront effacées. Les ambiances et les sons sont conservés. Cette
            action est définitive (pensez à exporter une sauvegarde).
          </>
        }
        confirmLabel="Supprimer définitivement"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          if (!target?.id) return;
          void deleteLocation(campaignId, target.id).then(({ deleted }) => {
            toast({ tone: 'success', title: deleted > 1 ? `${deleted} lieux supprimés` : 'Lieu supprimé' });
            onClose();
          });
        }}
      />
    </Sheet>
  );
}
