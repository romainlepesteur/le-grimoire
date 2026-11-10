import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { Copy, Headphones, MapPin, Music, Pencil, Plus, Square, Trash2, Waves } from 'lucide-react';
import type { Ambiance } from '@/domain/schemas';
import { useActiveCampaign } from '@/hooks/data';
import { createAmbiance, deleteAmbiance, duplicateAmbiance } from '@/services/db/ambiances';
import { db } from '@/services/db/database';
import { unlockAudio, useAudio } from '@/stores/audio';
import { useIsPrep } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Panel } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { AmbianceEditor } from './AmbianceEditor';
import { Equalizer } from './AudioControl';
import { SoundLibrary } from './SoundLibrary';
import { useCampaignAmbiances, useCampaignSounds } from './useAmbianceDirector';

function AmbianceCard({
  ambiance,
  soundNames,
  usedBy,
  index,
  onEdit,
}: {
  ambiance: Ambiance;
  soundNames: Map<string, string>;
  usedBy: string[];
  index: number;
  onEdit: () => void;
}) {
  const isPrep = useIsPrep();
  const { nowPlaying, override, setOverride, unlocked, running } = useAudio();
  const [confirm, setConfirm] = useState(false);
  const playing = nowPlaying?.ambianceId === ambiance.id;
  const manual = typeof override === 'object' && override?.ambianceId === ambiance.id;

  const listen = () => {
    if (manual) return setOverride(null);
    if (!unlocked) void unlockAudio();
    setOverride({ ambianceId: ambiance.id });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index, 10) * 0.04, ease: EASE_OUT }}
    >
      <Panel tone="leather" className={cn('flex h-full flex-col px-4 py-3.5 transition-shadow', playing && 'shadow-[0_0_24px_-6px_rgb(227_194_122/0.45)]')}>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="muted">{ambiance.category}</Badge>
              {playing && <Equalizer active={running} className="text-gold-300" />}
            </div>
            <h3 className="mt-1.5 truncate font-display text-lg font-semibold text-gold-200">{ambiance.name}</h3>
          </div>
          {isPrep && (
            <div className="flex shrink-0">
              <IconButton label="Modifier" onClick={onEdit}>
                <Pencil className="size-5" />
              </IconButton>
              <IconButton
                label="Dupliquer"
                onClick={() => void duplicateAmbiance(ambiance.id).then(() => toast({ tone: 'success', title: 'Ambiance dupliquée' }))}
              >
                <Copy className="size-5" />
              </IconButton>
              <IconButton label="Supprimer" onClick={() => setConfirm(true)} className="hover:text-blood-500">
                <Trash2 className="size-5" />
              </IconButton>
            </div>
          )}
        </div>
        <ul className="mt-2 flex-1 space-y-0.5 text-base text-parchment-300">
          {ambiance.layers.slice(0, 4).map((l) => (
            <li key={l.id} className="flex items-center gap-2 truncate">
              {l.bus === 'music' ? <Music className="size-4 shrink-0 text-bronze-400" /> : <Waves className="size-4 shrink-0 text-bronze-400" />}
              <span className="truncate">{soundNames.get(l.mediaId) ?? 'son manquant'}</span>
              {!l.loop && <span className="shrink-0 text-sm italic text-parchment-400">ponctuel</span>}
            </li>
          ))}
          {ambiance.layers.length > 4 && <li className="text-sm text-parchment-400">+ {ambiance.layers.length - 4} autre(s)</li>}
          {ambiance.layers.length === 0 && <li className="italic text-parchment-400">Aucun son pour l’instant.</li>}
        </ul>
        {usedBy.length > 0 && (
          <p className="mt-2 flex items-center gap-1.5 truncate text-sm text-parchment-400">
            <MapPin className="size-4 shrink-0" /> {usedBy.join(', ')}
          </p>
        )}
        <Button
          variant={manual ? 'secondary' : 'ghost'}
          size="sm"
          className="mt-3 w-full border-bronze-500/35"
          icon={manual ? <Square className="size-4" /> : <Headphones className="size-5" />}
          onClick={listen}
          disabled={ambiance.layers.length === 0}
        >
          {manual ? 'Revenir à l’ambiance du lieu' : playing ? 'En cours — la choisir' : 'Écouter maintenant'}
        </Button>
      </Panel>
      <ConfirmDialog
        open={confirm}
        danger
        title={`Supprimer « ${ambiance.name} » ?`}
        message={
          <>
            {usedBy.length
              ? `Les lieux qui l’utilisent (${usedBy.join(', ')}) reprendront l’ambiance de leur lieu parent.`
              : 'Aucun lieu ne l’utilise.'}{' '}
            Les sons restent dans la bibliothèque.
          </>
        }
        confirmLabel="Supprimer"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          if (manual) setOverride(null);
          void deleteAmbiance(ambiance.id).then(() => toast({ tone: 'success', title: 'Ambiance supprimée' }));
        }}
      />
    </motion.li>
  );
}

export function AmbiancesPage() {
  const campaign = useActiveCampaign();
  const isPrep = useIsPrep();
  const [tab, setTab] = useState<'ambiances' | 'sons'>('ambiances');
  const [editing, setEditing] = useState<string | null>(null);
  const ambiances = useCampaignAmbiances(campaign?.id) ?? [];
  const sounds = useCampaignSounds(campaign?.id) ?? [];
  const usage = useLiveQuery(async () => {
    if (!campaign) return new Map<string, string[]>();
    const locs = await db.locations.where('campaignId').equals(campaign.id).toArray();
    const m = new Map<string, string[]>();
    for (const l of locs) if (l.ambianceId) m.set(l.ambianceId, [...(m.get(l.ambianceId) ?? []), l.name]);
    return m;
  }, [campaign?.id]);
  if (!campaign) return null;

  const soundNames = new Map(sounds.map((s) => [s.id, s.name]));
  const sorted = [...ambiances].sort((a, b) => a.category.localeCompare(b.category, 'fr') || a.name.localeCompare(b.name, 'fr'));

  const create = async () => {
    const a = await createAmbiance(campaign.id, 'Nouvelle ambiance');
    setEditing(a.id);
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-6">
        <motion.header
          className="flex flex-wrap items-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold tracking-wide text-gold-200 text-engraved">Ambiances</h1>
            <p className="text-base text-parchment-300">
              Chaque lieu peut avoir son ambiance ; ses sous-lieux en héritent. Pendant la partie, vous pouvez en choisir une
              autre à tout moment.
            </p>
          </div>
          <div className="w-72">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'ambiances', label: `Ambiances (${ambiances.length})` },
                { value: 'sons', label: `Sons (${sounds.length})` },
              ]}
            />
          </div>
          {isPrep && tab === 'ambiances' && (
            <Button variant="primary" icon={<Plus className="size-5" />} onClick={() => void create()}>
              Nouvelle ambiance
            </Button>
          )}
        </motion.header>

        {tab === 'ambiances' ? (
          sorted.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sorted.map((a, i) => (
                <AmbianceCard
                  key={a.id}
                  ambiance={a}
                  index={i}
                  soundNames={soundNames}
                  usedBy={usage?.get(a.id) ?? []}
                  onEdit={() => setEditing(a.id)}
                />
              ))}
            </ul>
          ) : (
            <Panel ornate className="mx-auto max-w-xl px-8 py-8 text-center">
              <h2 className="font-display text-xl font-semibold text-ink-900">Aucune ambiance</h2>
              <p className="mt-2 text-lg text-ink-700">
                {isPrep
                  ? 'Importez d’abord quelques sons (onglet Sons), puis créez une ambiance qui les mélange.'
                  : 'Passez en mode Préparation pour importer des sons et composer vos ambiances.'}
              </p>
              {isPrep && (
                <div className="mt-5 flex justify-center gap-3">
                  <Button variant="ink" onClick={() => setTab('sons')}>
                    Importer des sons
                  </Button>
                  <Button variant="primary" onClick={() => void create()}>
                    Créer une ambiance
                  </Button>
                </div>
              )}
            </Panel>
          )
        ) : (
          <SoundLibrary campaignId={campaign.id} />
        )}
      </div>
      <AmbianceEditor ambianceId={isPrep ? editing : null} onClose={() => setEditing(null)} />
    </div>
  );
}
