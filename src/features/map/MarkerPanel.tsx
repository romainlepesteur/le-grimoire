import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Compass, Navigation, Pencil, Trash2, X } from 'lucide-react';
import {
  LOCATION_KIND_LABELS,
  MARKER_STATUSES,
  MARKER_STATUS_LABELS,
  type GameMap,
  type Location,
  type MapMarker,
} from '@/domain/schemas';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { travelTo } from '@/services/db/campaigns';
import { deleteMarker, saveMarker } from '@/services/db/maps';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { EmptyIllustration } from '@/ui/EmptyIllustration';
import { Field, Select, Slider, TextArea, TextInput } from '@/ui/Field';
import { Panel } from '@/ui/Panel';
import { EASE_OUT } from '@/ui/motion';

/** Fiche d'un marqueur, posée sur la carte. */
export function MarkerPanel({
  marker,
  map,
  location,
  pathLabel,
  isCurrent,
  editable,
  playerView,
  campaignId,
  onClose,
  onEditLocation,
}: {
  marker: MapMarker;
  map: GameMap;
  location: Location | undefined;
  pathLabel: string;
  isCurrent: boolean;
  editable: boolean;
  playerView: boolean;
  campaignId: string;
  onClose: () => void;
  onEditLocation: (id: string) => void;
}) {
  const navigate = useNavigate();
  const thumb = useMediaUrl(location?.imageId);
  const [label, setLabel] = useState(marker.label);
  const [note, setNote] = useState(marker.note);
  const [confirmTravel, setConfirmTravel] = useState(false);
  useEffect(() => {
    setLabel(marker.label);
    setNote(marker.note);
  }, [marker.id, marker.label, marker.note]);

  const name = location?.name ?? (marker.label || 'Point d’intérêt');
  const update = (patch: Partial<MapMarker>) =>
    void saveMarker(campaignId, marker.id, { mapId: marker.mapId, ...patch }).catch((e: Error) =>
      toast({ tone: 'error', title: 'Modification impossible', message: e.message }),
    );
  const maxRadius = Math.round(Math.max(map.width, map.height) / 3);
  const rumorForPlayer = playerView && marker.status === 'rumeur';

  return (
    <motion.div
      className="absolute right-3 top-3 bottom-3 z-[700] flex w-[min(340px,calc(100%-1.5rem))] flex-col"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <Panel tone="leather" className="flex max-h-full min-h-0 flex-col overflow-hidden">
        <div className="relative aspect-video shrink-0 overflow-hidden rounded-t-lg bg-leather-950">
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <EmptyIllustration theme={location?.theme ?? 'autre'} showHint={false} animated={false} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-leather-950/90 via-transparent to-transparent" />
          <IconButton label="Fermer la fiche" onClick={onClose} className="absolute right-1.5 top-1.5 bg-leather-950/55 backdrop-blur-sm">
            <X className="size-5" />
          </IconButton>
          <div className="absolute inset-x-3 bottom-2">
            <div className="flex flex-wrap gap-1.5">
              {location && <Badge tone="muted">{LOCATION_KIND_LABELS[location.kind]}</Badge>}
              {marker.status === 'rumeur' && <Badge tone="bronze">Rumeur</Badge>}
              {marker.status === 'cache' && <Badge tone="blood">Caché au joueur</Badge>}
              {isCurrent && <Badge tone="forest">Vous êtes ici</Badge>}
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold leading-tight text-parchment-50 text-engraved">{name}</h2>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 scrollbar-thin">
          {pathLabel && <p className="text-sm text-parchment-400">{pathLabel}</p>}
          {rumorForPlayer && (
            <p className="text-base italic text-parchment-300">Position approximative : on dit que ce lieu se trouve quelque part dans cette zone.</p>
          )}
          {location?.description && <p className="line-clamp-5 text-base leading-relaxed text-parchment-200">{location.description}</p>}
          {!location && marker.note && !editable && <p className="text-base leading-relaxed text-parchment-200">{marker.note}</p>}

          {location && (
            <div className="flex flex-wrap gap-2">
              {isCurrent ? (
                <Button size="sm" variant="secondary" icon={<Compass className="size-4" />} onClick={() => navigate('/')}>
                  Voir le lieu
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Navigation className="size-4" />} onClick={() => setConfirmTravel(true)}>
                  Déplacer le personnage ici…
                </Button>
              )}
            </div>
          )}

          {editable && (
            <div className="space-y-3 border-t border-bronze-500/25 pt-3">
              <Field label="Ce que le joueur en sait">
                <Select value={marker.status} onChange={(e) => update({ status: e.target.value as MapMarker['status'] })}>
                  {MARKER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {MARKER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              {marker.status === 'rumeur' && (
                <Field label={`Étendue de la zone (${Math.round(marker.radius)} px)`}>
                  <Slider
                    label="Rayon de la zone de rumeur"
                    value={Math.min(1, marker.radius / maxRadius)}
                    onChange={(v) => update({ radius: Math.max(20, Math.round(v * maxRadius)) })}
                  />
                </Field>
              )}
              {!location && (
                <>
                  <Field label="Nom">
                    <TextInput value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== marker.label && update({ label })} />
                  </Field>
                  <Field label="Note">
                    <TextArea rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== marker.note && update({ note })} />
                  </Field>
                </>
              )}
              <p className="text-sm text-parchment-400">Faites glisser l’épingle pour la déplacer (outil Déplacer).</p>
              <div className="flex flex-wrap gap-2">
                {location && (
                  <Button size="sm" icon={<Pencil className="size-4" />} onClick={() => onEditLocation(location.id)}>
                    Modifier le lieu
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="size-4" />}
                  className="hover:text-blood-500"
                  onClick={() => {
                    onClose();
                    void deleteMarker(marker.id).then(() => toast({ tone: 'success', title: 'Marqueur retiré de la carte' }));
                  }}
                >
                  Retirer de la carte
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>
      {location && (
        <ConfirmDialog
          open={confirmTravel}
          title={`Déplacer le personnage à « ${location.name} » ?`}
          message={
            <>
              Consulter un lieu sur la carte ne déplace jamais le personnage. Confirmez seulement si le MJ vient de
              vous y amener : ce lieu deviendra le lieu actuel{marker.status !== 'connu' ? ' et sera marqué comme connu sur la carte' : ''}.
            </>
          }
          confirmLabel="Déplacer le personnage"
          onCancel={() => setConfirmTravel(false)}
          onConfirm={() => {
            setConfirmTravel(false);
            void travelTo(campaignId, location.id)
              .then(() => toast({ tone: 'success', title: `Vous êtes à : ${location.name}` }))
              .catch((e: Error) => toast({ tone: 'error', title: e.message }));
          }}
        />
      )}
    </motion.div>
  );
}
