import { useCallback, useEffect, useState } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { EASE_OUT } from '@/ui/motion';

const RISE = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } };
import { useActiveCampaign, useSettings } from '@/hooks/data';
import { useFullscreen } from '@/hooks/device';
import { renameCampaign } from '@/services/db/campaigns';
import { db } from '@/services/db/database';
import { updateSettings } from '@/services/db/settings';
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '@/services/storage';
import { usePwa } from '@/stores/pwa';
import { useIsPrep } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Badge } from '@/ui/Badge';
import { Button } from '@/ui/Button';
import { Panel, SectionTitle } from '@/ui/Panel';
import { cn } from '@/ui/cn';
import { BackupSection } from './BackupSection';

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-4 text-left text-lg text-ink-900"
    >
      <span>{label}</span>
      <span
        className={cn(
          'flex h-8 w-14 shrink-0 items-center rounded-full border p-1 transition-colors duration-300',
          checked ? 'justify-end border-bronze-600 bg-bronze-500' : 'justify-start border-ink-700/30 bg-ink-900/10',
        )}
      >
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} className="size-6 rounded-full bg-parchment-50 shadow" />
      </span>
    </button>
  );
}

function CampaignSection() {
  const campaign = useActiveCampaign();
  const isPrep = useIsPrep();
  const [name, setName] = useState('');
  useEffect(() => setName(campaign?.name ?? ''), [campaign?.name]);
  const counts = useLiveQuery(async () => {
    if (!campaign) return null;
    const id = campaign.id;
    const [locations, media] = await Promise.all([
      db.locations.where('campaignId').equals(id).count(),
      db.mediaMeta.where('campaignId').equals(id).count(),
    ]);
    return { locations, media };
  }, [campaign?.id]);
  if (!campaign) return null;

  const save = async () => {
    try {
      await renameCampaign(campaign.id, name);
      toast({ tone: 'success', title: 'Campagne renommée' });
    } catch (e) {
      toast({ tone: 'error', title: 'Nom invalide', message: (e as Error).message });
    }
  };

  return (
    <Panel ornate className="px-6 py-5">
      <div className="flex items-center gap-2">
        <SectionTitle className="text-bronze-700">Campagne</SectionTitle>
        {campaign.isDemo && <Badge tone="ink">Exemple</Badge>}
      </div>
      {isPrep ? (
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            className="h-12 min-w-0 flex-1 rounded-md border border-ink-700/30 bg-parchment-50/70 px-3 text-lg text-ink-900 outline-none focus:border-bronze-600"
            aria-label="Nom de la campagne"
          />
          <Button variant="ink" disabled={!name.trim() || name.trim() === campaign.name} onClick={() => void save()}>
            Renommer
          </Button>
        </div>
      ) : (
        <p className="mt-2 font-display text-xl text-ink-900">{campaign.name}</p>
      )}
      {campaign.description && <p className="mt-2 text-base text-ink-500">{campaign.description}</p>}
      {counts && (
        <p className="mt-2 text-base text-ink-700">
          {counts.locations} lieu(x) · {counts.media} média(s) · créée le{' '}
          {new Date(campaign.createdAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })}
        </p>
      )}
    </Panel>
  );
}

function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = useCallback(() => void getStorageInfo().then(setInfo), []);
  useEffect(refresh, [refresh]);
  const ratio = info?.usage != null && info.quota ? Math.min(1, info.usage / info.quota) : 0;

  return (
    <Panel className="px-6 py-5">
      <div className="flex items-center justify-between">
        <SectionTitle className="text-bronze-700">Stockage sur cet appareil</SectionTitle>
        <button type="button" onClick={refresh} className="rounded p-2 text-ink-500 hover:text-ink-900" aria-label="Actualiser">
          <RefreshCw className="size-5" />
        </button>
      </div>
      {info && !info.supported && <p className="mt-2 text-lg text-blood-600">Informations de stockage indisponibles sur ce navigateur.</p>}
      {info?.supported && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <HardDrive className="size-6 shrink-0 text-ink-500" />
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-900/10">
              <div className="h-full rounded-full bg-gradient-to-r from-forest-500 to-bronze-500" style={{ width: `${Math.max(1, ratio * 100)}%` }} />
            </div>
          </div>
          <p className="mt-1.5 text-base text-ink-700">
            {formatBytes(info.usage)} utilisés sur {formatBytes(info.quota)} disponibles pour l’application
          </p>
          <p className="mt-2 text-base text-ink-700">
            Stockage persistant :{' '}
            {info.persisted ? (
              <strong className="text-forest-700">accordé</strong>
            ) : (
              <>
                <strong className="text-blood-600">non accordé</strong> — le navigateur pourrait effacer les données en cas de
                manque d’espace.{' '}
                <button
                  type="button"
                  className="font-semibold text-bronze-700 underline underline-offset-2"
                  onClick={() =>
                    void requestPersistence().then((ok) => {
                      refresh();
                      toast({
                        tone: ok ? 'success' : 'warning',
                        title: ok ? 'Stockage persistant accordé' : 'Refusé par le navigateur',
                        message: ok ? undefined : 'Installer l’application sur l’écran d’accueil aide à l’obtenir.',
                      });
                    })
                  }
                >
                  Demander
                </button>
              </>
            )}
          </p>
        </>
      )}
      <p className="mt-3 rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-base text-ink-700">
        Le stockage du navigateur n’est pas une sauvegarde : désinstaller l’application ou effacer les données de Chrome
        supprime la campagne. Exportez régulièrement.
      </p>
    </Panel>
  );
}

function AppSection() {
  const settings = useSettings();
  const { offlineReady, needRefresh, applyUpdate } = usePwa();
  const fullscreen = useFullscreen();
  const wakeSupported = 'wakeLock' in navigator;

  return (
    <Panel className="px-6 py-5">
      <SectionTitle className="text-bronze-700">Application</SectionTitle>
      <p className="mt-2 text-lg text-ink-700">
        Version {__APP_VERSION__} · Hors ligne :{' '}
        {offlineReady ? <strong className="text-forest-700">prêt</strong> : <strong>pas encore en cache</strong>}
      </p>
      {!offlineReady && (
        <p className="text-base text-ink-500">
          Le cache hors ligne s’active sur la version publiée (HTTPS), pas en mode développement.
        </p>
      )}
      {needRefresh && applyUpdate && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-bronze-600/40 bg-bronze-500/10 px-3 py-2">
          <span className="flex-1 text-base text-ink-700">Une nouvelle version est prête. Appliquez-la en dehors d’une partie.</span>
          <Button variant="primary" size="sm" onClick={() => void applyUpdate()}>
            Mettre à jour
          </Button>
        </div>
      )}
      <div className="mt-3 divide-y divide-ink-700/10">
        <Toggle
          label="Effets d’ambiance sur les illustrations (poussières, mouvement lent)"
          checked={settings.ambientEffects}
          onChange={(v) => void updateSettings({ ambientEffects: v })}
        />
        <Toggle
          label={wakeSupported ? 'Garder l’écran allumé pendant l’utilisation' : 'Garder l’écran allumé (non pris en charge ici)'}
          checked={settings.wakeLock}
          onChange={(v) => void updateSettings({ wakeLock: v })}
        />
        {fullscreen.supported && <Toggle label="Plein écran" checked={fullscreen.active} onChange={fullscreen.toggle} />}
      </div>
    </Panel>
  );
}

export function SettingsPage() {
  const campaign = useActiveCampaign();
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <motion.div
        className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-2 lg:p-6"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      >
        <motion.div variants={RISE} transition={{ duration: 0.5, ease: EASE_OUT }} className="space-y-4">
          <CampaignSection />
          {campaign && <BackupSection campaign={campaign} />}
        </motion.div>
        <motion.div variants={RISE} transition={{ duration: 0.5, ease: EASE_OUT }} className="space-y-4">
          <StorageSection />
          <AppSection />
          <Panel tone="leather" className="px-6 py-5">
            <SectionTitle className="text-bronze-400">Modes</SectionTitle>
            <p className="mt-2 text-lg text-parchment-200">
              <strong className="text-gold-200">Jeu</strong> — pour jouer : dés, fiches (points de vie, états, bourse,
              notes), inventaire et journal se modifient librement, en quelques secondes (bouton Noter). Le monde reste
              protégé. L’application démarre toujours dans ce mode.
            </p>
            <p className="mt-2 text-lg text-parchment-200">
              <strong className="text-gold-200">Préparation</strong> — pour créer et modifier le monde : lieux et
              illustrations, cartes, brouillard et marqueurs, ambiances et sons. Bouton en bas de la barre de gauche.
            </p>
          </Panel>
        </motion.div>
      </motion.div>
    </div>
  );
}
