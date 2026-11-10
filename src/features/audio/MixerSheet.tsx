import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Music, Volume2, Waves } from 'lucide-react';
import { useActiveCampaign, useSettings } from '@/hooks/data';
import { updateSettings } from '@/services/db/settings';
import { audioEngine, unlockAudio, useAudio } from '@/stores/audio';
import { Button } from '@/ui/Button';
import { Slider } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';
import { AmbianceChooser } from './AmbianceChooser';
import { useCampaignAmbiances, usePlaceAmbiance } from './useAmbianceDirector';

type Vol = { volumeMaster: number; volumeMusic: number; volumeSfx: number };

/** Réglage des volumes : appliqué immédiatement au son, enregistré un instant plus tard. */
function useVolumes() {
  const settings = useSettings();
  const [local, setLocal] = useState<Vol>(() => ({
    volumeMaster: settings.volumeMaster,
    volumeMusic: settings.volumeMusic,
    volumeSfx: settings.volumeSfx,
  }));
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!dirty.current) setLocal({ volumeMaster: settings.volumeMaster, volumeMusic: settings.volumeMusic, volumeSfx: settings.volumeSfx });
  }, [settings.volumeMaster, settings.volumeMusic, settings.volumeSfx]);

  const set = (patch: Partial<Vol>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    dirty.current = true;
    audioEngine.setVolumes({ master: next.volumeMaster, music: next.volumeMusic, sfx: next.volumeSfx, muted: settings.muted });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void updateSettings(next).then(() => (dirty.current = false));
    }, 300);
  };
  return [local, set] as const;
}

export function MixerSheet() {
  const { mixerOpen, setMixerOpen, unlocked, nowPlaying } = useAudio();
  const campaign = useActiveCampaign();
  const ambiances = useCampaignAmbiances(campaign?.id) ?? [];
  const place = usePlaceAmbiance();
  const placeName = ambiances.find((a) => a.id === place.ambianceId)?.name ?? null;
  const [vol, setVol] = useVolumes();
  const navigate = useNavigate();

  const rows = [
    { key: 'volumeMaster' as const, label: 'Général', icon: Volume2 },
    { key: 'volumeMusic' as const, label: 'Musique', icon: Music },
    { key: 'volumeSfx' as const, label: 'Bruitages', icon: Waves },
  ];

  const status = !nowPlaying
    ? 'Silence'
    : nowPlaying.source === 'manuel'
      ? `${nowPlaying.name} — choisie manuellement jusqu’au prochain lieu`
      : nowPlaying.source === 'herite'
        ? `${nowPlaying.name} — héritée de ${nowPlaying.inheritedFrom}`
        : `${nowPlaying.name} — ambiance du lieu`;

  return (
    <Sheet
      open={mixerOpen}
      onClose={() => setMixerOpen(false)}
      title="Ambiance sonore"
      subtitle={status}
      sizeClass="w-[min(620px,94vw)]"
      footer={
        <div className="flex justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setMixerOpen(false);
              navigate('/ambiances');
            }}
          >
            Gérer les ambiances et les sons
          </Button>
          <Button variant="secondary" onClick={() => setMixerOpen(false)}>
            Fermer
          </Button>
        </div>
      }
    >
      <div className="space-y-6 px-5 py-4">
        {!unlocked && (
          <div className="flex items-center gap-3 rounded-lg border border-bronze-500/40 bg-bronze-500/10 px-4 py-3">
            <p className="flex-1 text-base text-parchment-200">Le navigateur attend un toucher avant de jouer du son.</p>
            <Button variant="primary" size="sm" onClick={() => void unlockAudio()}>
              Activer
            </Button>
          </div>
        )}
        <section>
          <SectionTitle className="text-bronze-400">Volumes</SectionTitle>
          <div className="mt-2 space-y-1">
            {rows.map(({ key, label, icon: Icon }) => (
              <div key={key} className="flex items-center gap-3">
                <Icon className="size-5 shrink-0 text-parchment-300" />
                <span className="w-24 shrink-0 text-lg text-parchment-100">{label}</span>
                <Slider label={`Volume ${label.toLowerCase()}`} value={vol[key]} onChange={(v) => setVol({ [key]: v })} />
                <span className="w-11 shrink-0 text-right text-base tabular-nums text-parchment-300">{Math.round(vol[key] * 100)}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <SectionTitle className="text-bronze-400">Choisir l’ambiance</SectionTitle>
          <div className="mt-2">
            <AmbianceChooser ambiances={ambiances} placeAmbianceName={placeName} />
          </div>
        </section>
      </div>
    </Sheet>
  );
}
