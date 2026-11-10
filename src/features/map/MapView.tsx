import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import type { FogMask, GameMap, Location, MapMarker } from '@/domain/schemas';
import { Fog, rumorCenter, type BrushMode } from './fog';

export type MapTool = 'move' | 'reveal' | 'cover' | 'place';

export interface MapViewApi {
  undo: () => void;
  fill: (mode: BrushMode) => void;
  flyTo: (x: number, y: number) => void;
  fitAll: () => void;
  zoom: (delta: number) => void;
}

export interface MapViewProps {
  map: GameMap;
  imageUrl: string;
  fog: FogMask | undefined;
  /** Le brouillard est-il dessiné ? */
  fogVisible: boolean;
  fogOpacity: number;
  markers: MapMarker[];
  locations: Map<string, Location>;
  /** Vue du joueur : marqueurs cachés invisibles, rumeurs réduites à une zone. */
  playerView: boolean;
  editable: boolean;
  tool: MapTool;
  brushSize: number;
  currentLocationId: string | null;
  selectedMarkerId: string | null;
  onSelectMarker: (id: string | null) => void;
  onPlace: (x: number, y: number) => void;
  onMoveMarker: (id: string, x: number, y: number) => void;
  onFogChange: (dataUrl: string) => void;
  onUndoChange: (canUndo: boolean) => void;
  apiRef: Ref<MapViewApi>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Carte Leaflet (repère « image » : 1 unité = 1 pixel de la carte à zoom 0).
 * Pilotée de façon impérative ; React ne fait que lui transmettre l'état.
 */
export function MapView(props: MapViewProps) {
  const { map, imageUrl, fog: fogRow, apiRef } = props;
  const container = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const lmap = useRef<L.Map | null>(null);
  const fog = useRef<Fog | null>(null);
  const fogLayer = useRef<L.SVGOverlay | null>(null);
  const markerLayer = useRef<L.LayerGroup | null>(null);
  const loadedMask = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  // Dernières props, lues par les gestionnaires d'événements Leaflet (créés une seule fois).
  const live = useRef(props);
  live.current = props;

  const toLatLng = (x: number, y: number) => L.latLng(map.height - y, x);
  const fromLatLng = (ll: L.LatLng) => ({ x: ll.lng, y: map.height - ll.lat });

  // --- Création de la carte (une fois par carte et par image) -------------------------
  useEffect(() => {
    const el = container.current!;
    const bounds = L.latLngBounds([0, 0], [map.height, map.width]);
    const m = L.map(el, {
      crs: L.CRS.Simple,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      maxBoundsViscosity: 0.85,
      bounceAtZoomLimits: false,
    });
    el.classList.add('gm-map');
    L.imageOverlay(imageUrl, bounds, { className: 'gm-map-image' }).addTo(m);
    m.setMaxBounds(bounds.pad(0.25));
    // Cadrage : toute la carte visible. Recalculé quand l'écran change de taille,
    // et recadré tant que l'utilisateur n'a pas encore bougé la carte.
    let touched = false;
    const frame = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      m.invalidateSize({ animate: false });
      const fit = m.getBoundsZoom(bounds, false, L.point(48, 48));
      m.setMinZoom(fit - 0.5);
      m.setMaxZoom(Math.max(fit + 3.5, 1.5));
      if (!touched) m.fitBounds(bounds, { padding: [24, 24], animate: false });
    };
    m.setView([map.height / 2, map.width / 2], 0, { animate: false });
    frame();
    m.on('dragstart', () => (touched = true));
    el.addEventListener('wheel', () => (touched = true), { passive: true });
    el.addEventListener('touchstart', () => (touched = true), { passive: true });
    markerLayer.current = L.layerGroup().addTo(m);
    lmap.current = m;

    m.on('click', (e: L.LeafletMouseEvent) => {
      const p = live.current;
      if (p.tool === 'place') {
        const { x, y } = fromLatLng(e.latlng);
        if (x >= 0 && y >= 0 && x <= map.width && y <= map.height) p.onPlace(x, y);
      } else if (p.tool === 'move') p.onSelectMarker(null);
    });

    const ro = new ResizeObserver(frame);
    ro.observe(el);
    return () => {
      ro.disconnect();
      m.remove();
      lmap.current = null;
      markerLayer.current = null;
      fogLayer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, map.width, map.height, imageUrl]);

  // --- Brouillard : création et chargement du masque ----------------------------------
  useEffect(() => {
    const m = lmap.current;
    if (!m || !fogRow) return;
    const f = new Fog(fogRow.width, fogRow.height, map.id.length * 97 + map.width);
    f.opacity = live.current.fogOpacity;
    fog.current = f;
    loadedMask.current = fogRow.mask;
    void f.load(fogRow.mask).then(() => live.current.onUndoChange(false));
    const layer = L.svgOverlay(f.view as unknown as SVGElement, L.latLngBounds([0, 0], [map.height, map.width]), {
      className: 'gm-fog',
      interactive: false,
    });
    fogLayer.current = layer;
    if (live.current.fogVisible) layer.addTo(m);
    return () => {
      // Enregistre un trait en attente avant de quitter.
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
        live.current.onFogChange(f.toDataURL());
      }
      layer.remove();
      f.dispose();
      fog.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, fogRow?.id, imageUrl]);

  // Masque changé ailleurs (import de sauvegarde, « tout révéler » d'un autre écran…).
  useEffect(() => {
    const f = fog.current;
    if (!f || !fogRow || fogRow.mask === loadedMask.current) return;
    loadedMask.current = fogRow.mask;
    void f.load(fogRow.mask).then(() => live.current.onUndoChange(false));
  }, [fogRow?.mask, fogRow]);

  useEffect(() => {
    const m = lmap.current;
    const layer = fogLayer.current;
    if (!m || !layer) return;
    if (props.fogVisible && !m.hasLayer(layer)) layer.addTo(m);
    if (!props.fogVisible && m.hasLayer(layer)) layer.remove();
  }, [props.fogVisible]);

  useEffect(() => {
    if (!fog.current) return;
    fog.current.opacity = props.fogOpacity;
    fog.current.render();
  }, [props.fogOpacity]);

  const persistSoon = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      const f = fog.current;
      if (!f) return;
      const url = f.toDataURL();
      loadedMask.current = url;
      live.current.onFogChange(url);
    }, 700);
  };

  // --- Pinceau ------------------------------------------------------------------------
  useEffect(() => {
    const m = lmap.current;
    const el = container.current;
    if (!m || !el) return;
    const brushing = props.tool === 'reveal' || props.tool === 'cover';
    el.classList.toggle('gm-brush', brushing);
    el.classList.toggle('gm-place', props.tool === 'place');
    if (!brushing) {
      m.dragging.enable();
      if (cursor.current) cursor.current.style.display = 'none';
      return;
    }
    m.dragging.disable();
    const mode: BrushMode = props.tool === 'cover' ? 'cover' : 'reveal';
    const pointers = new Set<number>();
    let painting = false;

    const toMask = (e: PointerEvent) => {
      const f = fog.current!;
      const ll = m.mouseEventToLatLng(e as unknown as MouseEvent);
      const { x, y } = fromLatLng(ll);
      const k = f.width / map.width;
      // Rayon : taille à l'écran ramenée en pixels de carte (1 px de carte = 2^zoom px à l'écran).
      const r = (live.current.brushSize / 2 / Math.pow(2, m.getZoom())) * k;
      return { x: x * k, y: y * k, r: Math.max(1, r) };
    };
    const moveCursor = (e: PointerEvent) => {
      const c = cursor.current;
      if (!c) return;
      const rect = el.getBoundingClientRect();
      c.style.display = 'block';
      c.style.left = `${e.clientX - rect.left}px`;
      c.style.top = `${e.clientY - rect.top}px`;
      c.style.width = c.style.height = `${live.current.brushSize}px`;
    };

    const down = (e: PointerEvent) => {
      if (!fog.current || e.button > 0) return;
      pointers.add(e.pointerId);
      if (pointers.size > 1) {
        // Deux doigts : c'est un zoom. On annule le trait commencé.
        if (painting) fog.current.cancelStroke();
        painting = false;
        return;
      }
      painting = true;
      const p = toMask(e);
      fog.current.beginStroke(p.x, p.y, p.r, mode);
      el.setPointerCapture?.(e.pointerId);
      moveCursor(e);
    };
    const move = (e: PointerEvent) => {
      moveCursor(e);
      if (!painting || !fog.current) return;
      const p = toMask(e);
      fog.current.continueStroke(p.x, p.y, p.r, mode);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (painting && fog.current) {
        fog.current.endStroke();
        live.current.onUndoChange(fog.current.canUndo);
        persistSoon();
      }
      painting = false;
    };
    const leave = () => {
      if (cursor.current) cursor.current.style.display = 'none';
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.tool, map.id, imageUrl]);

  // --- Marqueurs ----------------------------------------------------------------------
  useEffect(() => {
    const group = markerLayer.current;
    if (!group) return;
    group.clearLayers();
    const { markers, locations, playerView, editable, tool, currentLocationId, selectedMarkerId } = props;
    for (const mk of markers) {
      if (playerView && mk.status === 'cache') continue;
      const loc = mk.locationId ? locations.get(mk.locationId) : undefined;
      if (mk.locationId && !loc) continue;
      const name = loc?.name ?? (mk.label || 'Point d’intérêt');
      const select = () => live.current.onSelectMarker(mk.id);

      if (mk.status === 'rumeur') {
        const c = rumorCenter(mk);
        L.circle(toLatLng(c.x, c.y), {
          radius: mk.radius,
          color: '#e3c27a',
          weight: 2,
          dashArray: '6 8',
          opacity: playerView ? 0.85 : 0.45,
          fillColor: '#e3c27a',
          fillOpacity: playerView ? 0.08 : 0.04,
          interactive: playerView,
        })
          .on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            select();
          })
          .addTo(group);
        if (playerView) {
          L.marker(toLatLng(c.x, c.y), {
            icon: L.divIcon({ className: 'gm-marker', html: `<div class="gm-rumor">? ${esc(name)}</div>`, iconSize: [0, 0] }),
            keyboard: false,
          })
            .on('click', select)
            .addTo(group);
          continue;
        }
      }

      const classes = [
        'gm-pin',
        mk.locationId && mk.locationId === currentLocationId ? 'gm-current' : '',
        mk.id === selectedMarkerId ? 'gm-selected' : '',
        mk.status === 'cache' ? 'gm-hidden' : '',
        mk.locationId ? '' : 'gm-free',
      ].join(' ');
      const marker = L.marker(toLatLng(mk.x, mk.y), {
        icon: L.divIcon({
          className: 'gm-marker',
          html: `<div class="${classes}"><span class="gm-pin-dot"></span><span class="gm-pin-label">${esc(name)}</span></div>`,
          iconSize: [0, 0],
        }),
        draggable: editable && tool === 'move',
        autoPan: true,
        riseOnHover: true,
        zIndexOffset: mk.id === selectedMarkerId ? 1000 : mk.locationId === currentLocationId ? 500 : 0,
        title: name,
      });
      marker.on('click', select);
      marker.on('dragend', () => {
        const { x, y } = fromLatLng(marker.getLatLng());
        live.current.onMoveMarker(mk.id, x, y);
      });
      marker.addTo(group);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.markers,
    props.locations,
    props.playerView,
    props.editable,
    props.tool,
    props.currentLocationId,
    props.selectedMarkerId,
    map.id,
    imageUrl,
  ]);

  useImperativeHandle(
    apiRef,
    () => ({
      undo: () => {
        const f = fog.current;
        if (f?.undo()) {
          live.current.onUndoChange(f.canUndo);
          persistSoon();
        }
      },
      fill: (mode) => {
        const f = fog.current;
        if (!f) return;
        f.fill(mode);
        live.current.onUndoChange(true);
        persistSoon();
      },
      flyTo: (x, y) => {
        const m = lmap.current;
        if (m) m.flyTo(toLatLng(x, y), Math.max(m.getZoom(), m.getMinZoom() + 1.5), { duration: 0.9 });
      },
      fitAll: () => lmap.current?.flyToBounds(L.latLngBounds([0, 0], [map.height, map.width]), { padding: [24, 24], duration: 0.7 }),
      zoom: (d) => (d > 0 ? lmap.current?.zoomIn(0.75) : lmap.current?.zoomOut(0.75)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map.id, map.width, map.height],
  );

  return (
    <div className="absolute inset-0">
      <div ref={container} className="absolute inset-0" />
      <div ref={cursor} className={`gm-brush-cursor ${props.tool === 'cover' ? 'gm-cover' : ''}`} style={{ display: 'none' }} />
    </div>
  );
}
