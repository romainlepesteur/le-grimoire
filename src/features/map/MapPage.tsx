import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useLocation as useRoute, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  Brush,
  Crosshair,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Layers,
  LocateFixed,
  Map as MapIcon,
  MapPinPlus,
  Maximize,
  Minus,
  Plus,
  Radar,
  ScanEye,
  Undo2,
  X,
} from 'lucide-react';
import type { Location } from '@/domain/schemas';
import { useActiveCampaign, useCampaignLocations } from '@/hooks/data';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { db } from '@/services/db/database';
import { saveFogMask, saveMarker, setCurrentMap, setFogEnabled } from '@/services/db/maps';
import { useIsPrep } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Select, Slider } from '@/ui/Field';
import { Panel } from '@/ui/Panel';
import { EASE_OUT } from '@/ui/motion';
import { cn } from '@/ui/cn';
import { LocationEditor, type LocationEditorTarget } from '@/features/locations/LocationEditor';
import { MapManager, NewMapForm } from './MapManager';
import { MapView, type MapTool, type MapViewApi } from './MapView';
import { MarkerPanel } from './MarkerPanel';
import { PlaceChooser, type PlaceChoice } from './PlaceChooser';

const TOOLS: { value: MapTool; label: string; icon: typeof Hand; hint: string }[] = [
  { value: 'move', label: 'Déplacer', icon: Hand, hint: 'Faire glisser la carte et les épingles' },
  { value: 'reveal', label: 'Révéler', icon: Brush, hint: 'Peindre pour dissiper le brouillard' },
  { value: 'cover', label: 'Recouvrir', icon: Eraser, hint: 'Peindre pour remettre du brouillard' },
  { value: 'place', label: 'Placer', icon: MapPinPlus, hint: 'Toucher la carte pour poser un lieu' },
];

/** Petite barre flottante sur la carte. */
function Floating({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('pointer-events-auto rounded-xl border border-bronze-500/40 bg-leather-950/80 shadow-xl backdrop-blur-md', className)}>
      {children}
    </div>
  );
}

export function MapPage() {
  const campaign = useActiveCampaign();
  const isPrep = useIsPrep();
  const navigate = useNavigate();
  const route = useRoute();
  const maps = useLiveQuery(
    async () => (campaign ? (await db.maps.where('campaignId').equals(campaign.id).toArray()).sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [campaign?.id],
  );
  const map = maps?.find((m) => m.id === campaign?.currentMapId) ?? maps?.[0];
  const fog = useLiveQuery(() => (map ? db.fogMasks.where('mapId').equals(map.id).first() : undefined), [map?.id]);
  const markers = useLiveQuery(() => (map ? db.markers.where('mapId').equals(map.id).toArray() : []), [map?.id]) ?? [];
  const locationList = useCampaignLocations(campaign?.id);
  const locations = useMemo(() => new Map((locationList ?? []).map((l) => [l.id, l])), [locationList]);
  const imageUrl = useMediaUrl(map?.imageId);

  const [tool, setTool] = useState<MapTool>('move');
  const [brushSize, setBrushSize] = useState(90);
  const [preview, setPreview] = useState(false);
  /**
   * Préparation : voir sous le brouillard (carte et lieux non découverts). Désactivé par défaut,
   * pour pouvoir dissiper le brouillard au fil de la partie sans se gâcher la suite.
   */
  const [peek, setPeek] = useState(false);
  const [confirmPeek, setConfirmPeek] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<{ x: number; y: number } | null>(null);
  /** Lieu à placer, arrivé depuis l'éditeur de lieu (« Placer sur la carte »). */
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [confirmFill, setConfirmFill] = useState<'reveal' | 'cover' | null>(null);
  const [editor, setEditor] = useState<LocationEditorTarget | null>(null);
  /** Outil « Révéler autour de la position » : ouvert ? rayon en fraction du grand côté de la carte. */
  const [aroundOpen, setAroundOpen] = useState(false);
  const [aroundRadius, setAroundRadius] = useState(0.08);
  const api = useRef<MapViewApi>(null);

  // Hors Préparation : uniquement consulter.
  useEffect(() => {
    if (!isPrep) {
      setTool('move');
      setPreview(false);
      setPeek(false);
      setPlacing(null);
      setPendingLocation(null);
      setAroundOpen(false);
    }
  }, [isPrep]);

  // Arrivée depuis « Placer sur la carte ».
  useEffect(() => {
    const id = (route.state as { placeLocationId?: string } | null)?.placeLocationId;
    if (!id || !map) return;
    navigate('.', { replace: true, state: null });
    const existing = markers.find((m) => m.locationId === id);
    if (existing) {
      setSelected(existing.id);
      api.current?.flyTo(existing.x, existing.y);
      toast({ tone: 'info', title: 'Ce lieu est déjà sur cette carte', message: 'Faites glisser son épingle pour le déplacer.' });
    } else {
      setPendingLocation(id);
      setTool('place');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.state, map?.id]);

  const playerView = !isPrep || preview;
  const editable = isPrep && !preview;
  const fogVisible = !!fog?.enabled;
  /** Sans spoil : ce qui est sous le brouillard reste caché, même en Préparation. */
  const spoilFree = playerView || !peek;
  const fogOpacity = spoilFree ? 1 : 0.6;
  // Position du personnage sur cette carte : son lieu, ou à défaut le lieu parent le plus proche
  // qui y figure (on est à l'auberge : on voit la ville).
  const currentLocationId = (() => {
    let id = campaign?.currentLocationId ?? null;
    for (let guard = 0; id && guard < 8; guard++) {
      if (markers.some((m) => m.locationId === id && (!spoilFree || m.status === 'connu'))) return id;
      id = locations.get(id)?.parentId ?? null;
    }
    return campaign?.currentLocationId ?? null;
  })();
  const visibleMarkers = spoilFree ? markers.filter((m) => m.status !== 'cache') : markers;
  const selectedMarker = visibleMarkers.find((m) => m.id === selected);
  const currentMarker = markers.find((m) => m.locationId === currentLocationId && (!spoilFree || m.status === 'connu'));
  // En Préparation, la position compte même si son marqueur est encore caché au joueur.
  const prepPositionMarker = markers.find((m) => m.locationId === currentLocationId);
  const aroundPx = map ? Math.round(aroundRadius * Math.max(map.width, map.height)) : 0;
  const revealPreview =
    aroundOpen && editable && prepPositionMarker ? { x: prepPositionMarker.x, y: prepPositionMarker.y, r: aroundPx } : null;

  const pathLabel = (l: Location | undefined) => {
    const names: string[] = [];
    let p = l?.parentId ? locations.get(l.parentId) : undefined;
    while (p && names.length < 4) {
      names.unshift(p.name);
      p = p.parentId ? locations.get(p.parentId) : undefined;
    }
    return names.join(' › ');
  };

  const placeMarker = async (x: number, y: number, choice: PlaceChoice) => {
    if (!campaign || !map) return;
    try {
      const m = await saveMarker(campaign.id, null, {
        mapId: map.id,
        locationId: choice.locationId,
        label: choice.label,
        status: choice.status,
        x,
        y,
        radius: Math.round(Math.max(map.width, map.height) / 18),
      });
      setSelected(m.id);
      setTool('move');
      const hidden = spoilFree && fogVisible && choice.status === 'connu' && !api.current?.isRevealed(x, y);
      toast(
        hidden
          ? { tone: 'info', title: 'Marqueur placé sous le brouillard', message: 'Il apparaîtra quand cette zone sera révélée.' }
          : { tone: 'success', title: 'Marqueur placé' },
      );
    } catch (e) {
      toast({ tone: 'error', title: 'Placement impossible', message: (e as Error).message });
    }
  };

  if (!campaign || maps === undefined) return null;

  // ---------------------------------------------------------------- Aucune carte
  if (!map) {
    return (
      <div className="flex h-full items-center justify-center overflow-y-auto p-6">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
          <Panel tone="leather" className="w-[min(620px,92vw)] px-7 py-7">
            <div className="flex items-center gap-3">
              <MapIcon className="size-8 text-bronze-400" strokeWidth={1.4} />
              <h1 className="font-display text-2xl font-semibold text-gold-200 text-engraved">Aucune carte</h1>
            </div>
            <p className="mt-3 text-lg text-parchment-200">
              Importez l’image de votre monde ou d’une région. Le brouillard la recouvre entièrement ; vous le dissipez
              au pinceau au fil de l’exploration, et vous y placez vos lieux.
            </p>
            {isPrep ? (
              <div className="mt-5">
                <NewMapForm campaignId={campaign.id} />
              </div>
            ) : (
              <p className="mt-4 text-base italic text-parchment-400">Passez en mode Préparation pour importer une carte.</p>
            )}
            <p className="mt-4 text-sm text-parchment-400">Un prompt pour générer une carte cohérente est fourni dans le guide des illustrations.</p>
          </Panel>
        </motion.div>
      </div>
    );
  }

  const placedIds = new Set(markers.filter((m) => m.locationId).map((m) => m.locationId!));
  const brushing = tool === 'reveal' || tool === 'cover';

  return (
    <div className="relative isolate h-full overflow-hidden">
      {/* isolate : les calques Leaflet (z-index 400+) restent sous les tiroirs et dialogues. */}
      {imageUrl && fog !== undefined && (
        <MapView
          map={map}
          imageUrl={imageUrl}
          fog={fog}
          fogVisible={fogVisible}
          fogOpacity={fogOpacity}
          markers={visibleMarkers}
          locations={locations}
          playerView={playerView}
          spoilFree={spoilFree}
          editable={editable}
          tool={editable ? tool : 'move'}
          brushSize={brushSize}
          revealPreview={revealPreview}
          currentLocationId={currentLocationId}
          selectedMarkerId={selected}
          onSelectMarker={setSelected}
          onPlace={(x, y) => {
            if (pendingLocation) {
              const id = pendingLocation;
              setPendingLocation(null);
              void placeMarker(x, y, { locationId: id, label: '', status: 'connu' });
            } else setPlacing({ x, y });
          }}
          onMoveMarker={(id, x, y) => void saveMarker(campaign.id, id, { mapId: map.id, x, y })}
          onFogChange={(mapId, url) => void saveFogMask(mapId, url)}
          onUndoChange={setCanUndo}
          apiRef={api}
        />
      )}

      {/* Haut gauche : carte affichée et outils */}
      <div className="pointer-events-none absolute left-3 top-3 z-[600] flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-2">
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
        >
          {maps.length > 1 ? (
            <Floating className="p-1">
              <Select
                value={map.id}
                onChange={(e) => void setCurrentMap(campaign.id, e.target.value)}
                className="h-11 w-56 border-none bg-transparent font-display text-base"
                aria-label="Carte affichée"
              >
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Floating>
          ) : (
            <Floating className="px-4 py-2.5">
              <span className="font-display text-base tracking-wide text-gold-200">{map.name}</span>
            </Floating>
          )}
          {isPrep && (
            <Floating className="p-1">
              <Button variant="ghost" size="sm" icon={<Layers className="size-5" />} onClick={() => setManagerOpen(true)}>
                Cartes
              </Button>
            </Floating>
          )}
        </motion.div>

        <AnimatePresence>
          {isPrep && (
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="flex flex-col items-start gap-2"
            >
              <Floating className="flex items-center gap-1 p-1">
                {TOOLS.map(({ value, label, icon: Icon, hint }) => {
                  const active = !preview && tool === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      title={hint}
                      disabled={preview}
                      onClick={() => {
                        setTool(value);
                        setPendingLocation(null);
                      }}
                      className={cn(
                        'relative flex h-12 min-w-[76px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 transition-colors disabled:opacity-40',
                        active ? 'text-leather-950' : 'text-parchment-200 hover:bg-parchment-100/8',
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="map-tool"
                          className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-300 to-bronze-500"
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                      )}
                      <Icon className="relative size-5" />
                      <span className="relative font-display text-[0.62rem] font-semibold uppercase tracking-[0.08em]">{label}</span>
                    </button>
                  );
                })}
                <span className="mx-1 h-8 w-px bg-bronze-500/30" />
                <IconButton label="Annuler le dernier coup de pinceau" disabled={!canUndo || preview} onClick={() => api.current?.undo()}>
                  <Undo2 className="size-5" />
                </IconButton>
                <IconButton
                  label={
                    prepPositionMarker
                      ? 'Révéler autour de la position actuelle'
                      : 'Révéler autour de la position (placez d’abord le lieu actuel sur la carte)'
                  }
                  active={aroundOpen && !preview}
                  disabled={preview || !prepPositionMarker}
                  onClick={() => {
                    const open = !aroundOpen;
                    setAroundOpen(open);
                    if (open && prepPositionMarker) {
                      setTool('move');
                      api.current?.flyTo(prepPositionMarker.x, prepPositionMarker.y);
                    }
                  }}
                >
                  <Radar className="size-5" />
                </IconButton>
                <IconButton
                  label={peek ? 'Ne plus voir sous le brouillard' : 'Voir sous le brouillard (dévoile toute la carte)'}
                  active={peek && !preview}
                  disabled={preview}
                  onClick={() => (peek ? setPeek(false) : setConfirmPeek(true))}
                >
                  <ScanEye className="size-5" />
                </IconButton>
                <IconButton
                  label={preview ? 'Quitter l’aperçu joueur' : 'Voir comme le joueur'}
                  active={preview}
                  onClick={() => {
                    setPreview((p) => !p);
                    setSelected(null);
                  }}
                >
                  {preview ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </IconButton>
              </Floating>

              <AnimatePresence>
                {brushing && !preview && (
                  <motion.div
                    key="brush"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Floating className="flex items-center gap-3 whitespace-nowrap px-3 py-1.5">
                      <span className="text-base text-parchment-300">Pinceau</span>
                      <Slider label="Taille du pinceau" className="w-40" value={(brushSize - 20) / 200} onChange={(v) => setBrushSize(Math.round(20 + v * 200))} />
                      <span className="w-10 text-right text-sm tabular-nums text-parchment-400">{brushSize}</span>
                      <span className="mx-1 h-6 w-px bg-bronze-500/30" />
                      <Button variant="ghost" size="sm" onClick={() => setConfirmFill('reveal')}>
                        Tout révéler
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmFill('cover')}>
                        Tout recouvrir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fog && void setFogEnabled(map.id, !fog.enabled)}
                        title="Désactiver le brouillard pour cette carte (plan de ville déjà connu, par exemple)"
                      >
                        {fog?.enabled ? 'Désactiver le brouillard' : 'Activer le brouillard'}
                      </Button>
                    </Floating>
                  </motion.div>
                )}
                {aroundOpen && !preview && prepPositionMarker && (
                  <motion.div
                    key="around"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25 }}
                  >
                    <Floating className="flex items-center gap-3 whitespace-nowrap px-3 py-1.5">
                      <Radar className="size-5 text-gold-300" />
                      <span className="min-w-0 max-w-64 truncate text-base text-parchment-200">
                        Autour de « {locations.get(prepPositionMarker.locationId!)?.name ?? 'la position'} »
                      </span>
                      <Slider
                        label="Rayon à révéler"
                        className="w-24 shrink-0 xl:w-36"
                        value={(aroundRadius - 0.02) / 0.28}
                        onChange={(v) => setAroundRadius(0.02 + v * 0.28)}
                      />
                      <span className="w-16 text-right text-sm tabular-nums text-parchment-400">{aroundPx} px</span>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          api.current?.revealAround(prepPositionMarker.x, prepPositionMarker.y, aroundPx);
                          toast({ tone: 'success', title: 'Zone révélée', message: 'Le bouton Annuler permet de revenir en arrière.' });
                        }}
                      >
                        Révéler
                      </Button>
                      <IconButton label="Fermer" onClick={() => setAroundOpen(false)}>
                        <X className="size-5" />
                      </IconButton>
                    </Floating>
                  </motion.div>
                )}
                {(tool === 'place' || pendingLocation) && !preview && (
                  <motion.div key="place" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }}>
                    <Floating className="flex items-center gap-2 border-gold-300/50 px-4 py-2.5 text-base text-gold-200">
                      <Crosshair className="size-5" />
                      {pendingLocation
                        ? `Touchez la carte pour placer « ${locations.get(pendingLocation)?.name ?? 'ce lieu'} »`
                        : 'Touchez la carte à l’endroit du lieu'}
                    </Floating>
                  </motion.div>
                )}
                {peek && !preview && (
                  <motion.div key="peek" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <Floating className="flex items-center gap-3 border-ember-500/60 px-4 py-2 text-base text-gold-200">
                      <ScanEye className="size-5 text-ember-500" />
                      Vous voyez sous le brouillard : toute la carte et tous les lieux.
                      <Button variant="ghost" size="sm" onClick={() => setPeek(false)}>
                        Masquer
                      </Button>
                    </Floating>
                  </motion.div>
                )}
                {preview && (
                  <motion.div key="preview" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                    <Floating className="px-4 py-2.5 text-base text-parchment-200">
                      Aperçu : la carte telle que le joueur la voit en mode Jeu.
                    </Floating>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bas gauche : zoom et position */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[600] flex flex-col gap-2">
        <Floating className="flex flex-col p-1">
          <IconButton label="Zoomer" onClick={() => api.current?.zoom(1)}>
            <Plus className="size-5" />
          </IconButton>
          <IconButton label="Dézoomer" onClick={() => api.current?.zoom(-1)}>
            <Minus className="size-5" />
          </IconButton>
          <IconButton label="Voir toute la carte" onClick={() => api.current?.fitAll()}>
            <Maximize className="size-5" />
          </IconButton>
          {currentMarker && (
            <IconButton
              label="Où suis-je ?"
              onClick={() => {
                api.current?.flyTo(currentMarker.x, currentMarker.y);
                setSelected(currentMarker.id);
              }}
            >
              <LocateFixed className="size-5 text-gold-300" />
            </IconButton>
          )}
        </Floating>
      </div>

      <AnimatePresence>
        {selectedMarker && (
          <MarkerPanel
            key={selectedMarker.id}
            marker={selectedMarker}
            map={map}
            location={selectedMarker.locationId ? locations.get(selectedMarker.locationId) : undefined}
            pathLabel={pathLabel(selectedMarker.locationId ? locations.get(selectedMarker.locationId) : undefined)}
            isCurrent={!!selectedMarker.locationId && selectedMarker.locationId === campaign.currentLocationId}
            editable={editable}
            playerView={playerView}
            campaignId={campaign.id}
            onClose={() => setSelected(null)}
            onEditLocation={(id) => setEditor({ id })}
          />
        )}
      </AnimatePresence>

      {!imageUrl && map.imageId && (
        <div className="absolute inset-0 flex items-center justify-center text-parchment-400">Chargement de la carte…</div>
      )}

      <PlaceChooser
        open={!!placing}
        locations={locationList ?? []}
        placedIds={placedIds}
        onClose={() => setPlacing(null)}
        onChoose={(c) => {
          const at = placing;
          setPlacing(null);
          if (at) void placeMarker(at.x, at.y, c);
        }}
      />
      <MapManager open={managerOpen} onClose={() => setManagerOpen(false)} campaignId={campaign.id} maps={maps} currentMapId={map.id} />
      <LocationEditor campaignId={campaign.id} target={isPrep ? editor : null} onClose={() => setEditor(null)} />
      <ConfirmDialog
        open={confirmPeek}
        title="Voir sous le brouillard ?"
        message={
          <>
            Toute la carte et tous les lieux, même ceux qui ne sont pas encore découverts, seront visibles. Utile pour
            construire la carte ou placer des lieux ; à éviter si vous voulez garder la surprise. Le brouillard redevient
            opaque quand vous quittez la Préparation.
          </>
        }
        confirmLabel="Voir sous le brouillard"
        onCancel={() => setConfirmPeek(false)}
        onConfirm={() => {
          setPeek(true);
          setConfirmPeek(false);
        }}
      />
      <ConfirmDialog
        open={!!confirmFill}
        title={confirmFill === 'reveal' ? 'Révéler toute la carte ?' : 'Recouvrir toute la carte ?'}
        message={
          confirmFill === 'reveal'
            ? 'Tout le brouillard de cette carte sera dissipé. Le bouton Annuler permet de revenir en arrière.'
            : 'Toute la carte retournera dans le brouillard. Le bouton Annuler permet de revenir en arrière.'
        }
        confirmLabel={confirmFill === 'reveal' ? 'Tout révéler' : 'Tout recouvrir'}
        onCancel={() => setConfirmFill(null)}
        onConfirm={() => {
          if (confirmFill) api.current?.fill(confirmFill);
          setConfirmFill(null);
        }}
      />
    </div>
  );
}

export default MapPage;
