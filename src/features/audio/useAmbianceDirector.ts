import { useEffect, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { effectiveAmbiance } from '@/domain/locationTree';
import type { Ambiance, MediaMeta } from '@/domain/schemas';
import { useActiveCampaign, useCurrentPlace, useSettings } from '@/hooks/data';
import type { AmbianceSpec } from '@/services/audio/engine';
import { db } from '@/services/db/database';
import { audioEngine, useAudio, type NowPlaying } from '@/stores/audio';

export function useCampaignAmbiances(campaignId: string | undefined): Ambiance[] | undefined {
  return useLiveQuery(
    () => (campaignId ? db.ambiances.where('campaignId').equals(campaignId).toArray() : []),
    [campaignId],
  );
}

export function useCampaignSounds(campaignId: string | undefined): MediaMeta[] | undefined {
  return useLiveQuery(
    () =>
      campaignId
        ? db.mediaMeta
            .where('campaignId')
            .equals(campaignId)
            .filter((m) => m.kind === 'audio')
            .toArray()
        : [],
    [campaignId],
  );
}

/** Ambiance que le lieu courant ferait jouer (sans tenir compte d'un choix manuel). */
export function usePlaceAmbiance() {
  const { path } = useCurrentPlace();
  return effectiveAmbiance(path);
}

/**
 * Chef d'orchestre, monté une seule fois dans le cadre de l'application :
 * il suit le lieu courant (ou le choix manuel) et pilote le moteur audio.
 */
export function useAmbianceDirector() {
  const campaign = useActiveCampaign();
  const { location, path } = useCurrentPlace();
  const settings = useSettings();
  const ambiances = useCampaignAmbiances(campaign?.id);
  const sounds = useCampaignSounds(campaign?.id);
  const override = useAudio((s) => s.override);
  const setOverride = useAudio((s) => s.setOverride);
  const setNowPlaying = useAudio((s) => s.setNowPlaying);

  // Un choix manuel est oublié dès qu'on change de lieu.
  const lastLocation = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastLocation.current !== undefined && lastLocation.current !== location?.id) setOverride(null);
    lastLocation.current = location?.id;
  }, [location?.id, setOverride]);

  useEffect(() => {
    audioEngine.setVolumes({
      master: settings.volumeMaster,
      music: settings.volumeMusic,
      sfx: settings.volumeSfx,
      muted: settings.muted,
    });
  }, [settings.volumeMaster, settings.volumeMusic, settings.volumeSfx, settings.muted]);

  const { spec, now } = useMemo((): { spec: AmbianceSpec | null; now: NowPlaying | null } => {
    if (!ambiances || !sounds) return { spec: null, now: null };
    let ambiance: Ambiance | undefined;
    let source: NowPlaying['source'] = 'lieu';
    let inheritedFrom: string | null = null;
    if (override === 'silence') return { spec: null, now: null };
    if (override) {
      ambiance = ambiances.find((a) => a.id === override.ambianceId);
      source = 'manuel';
    } else {
      const eff = effectiveAmbiance(path);
      ambiance = ambiances.find((a) => a.id === eff.ambianceId);
      if (eff.inheritedFrom) {
        source = 'herite';
        inheritedFrom = eff.inheritedFrom;
      }
    }
    if (!ambiance) return { spec: null, now: null };
    const byId = new Map(sounds.map((s) => [s.id, s]));
    const layers = ambiance.layers
      .filter((l) => byId.has(l.mediaId))
      .map((l) => ({ ...l, duration: byId.get(l.mediaId)!.duration, size: byId.get(l.mediaId)!.size }));
    return {
      spec: { id: ambiance.id, layers },
      now: { ambianceId: ambiance.id, name: ambiance.name, source, inheritedFrom, layerCount: layers.length },
    };
  }, [ambiances, sounds, override, path]);

  const specKey = JSON.stringify(spec);
  useEffect(() => {
    audioEngine.play(spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  const nowKey = JSON.stringify(now);
  useEffect(() => {
    setNowPlaying(now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowKey, setNowPlaying]);
}
