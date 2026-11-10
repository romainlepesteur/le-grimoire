import { useState } from 'react';
import { useLocation, useOutlet } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { Feather } from 'lucide-react';
import { EASE_OUT } from '@/ui/motion';
import { NavRail } from './NavRail';
import { StatusBar } from './StatusBar';
import { useActiveCampaign, useSettings } from '@/hooks/data';
import { useWakeLock } from '@/hooks/device';
import { updateSettings } from '@/services/db/settings';
import { useSession } from '@/stores/session';
import { Toaster } from '@/ui/Toaster';
import { Button } from '@/ui/Button';
import { ConfirmDialog, Dialog } from '@/ui/Dialog';
import { Sheet } from '@/ui/Sheet';
import { ComingSoon } from '@/features/placeholders/ComingSoon';

const BACKUP_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;

export function AppShell() {
  const { mode, setMode, immersive, diceOpen, setDiceOpen } = useSession();
  const location = useLocation();
  const outlet = useOutlet();
  const settings = useSettings();
  const campaign = useActiveCampaign();
  const [confirmPrep, setConfirmPrep] = useState(false);
  useWakeLock(settings.wakeLock);

  // Rappel d'export : modifications non sauvegardées depuis plus de 3 jours.
  const lastExport = settings.lastExportAt;
  const backupDue =
    !!campaign &&
    (lastExport == null || campaign.updatedAt > lastExport) &&
    Date.now() - (lastExport ?? campaign.createdAt) > BACKUP_REMINDER_MS;

  const requestMode = () => {
    if (mode === 'preparation') setMode('jeu');
    else setConfirmPrep(true);
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden tex-leather">
      {/* Le mode immersion recouvre tout (calque fixe) : le cadre reste monté dessous, sans saut de mise en page. */}
      <NavRail backupDue={backupDue} onRequestMode={requestMode} />

      <div className="flex min-w-0 flex-1 flex-col" aria-hidden={immersive || undefined}>
        <AnimatePresence initial={false}>
          {mode === 'preparation' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 36, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT }}
              className="flex shrink-0 items-center justify-center gap-2 overflow-hidden border-b border-ember-500/50 bg-ember-500/15 font-display text-xs font-semibold uppercase tracking-[0.2em] text-gold-200"
            >
              <Feather className="size-4" /> Mode Préparation — les modifications sont possibles
            </motion.div>
          )}
        </AnimatePresence>
        <main className="relative min-h-0 flex-1">
          {/* Fondu entre les écrans (opacité seule : aucun transform qui gênerait les calques fixes). */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
        <StatusBar />
      </div>

      <Sheet open={diceOpen} onClose={() => setDiceOpen(false)} title="Dés" subtitle="Lancers rapides, accessibles depuis tous les écrans">
        <ComingSoon
          phase={4}
          compact
          title="Le module de dés arrive en phase 4"
          features={[
            'D4, D6, D8, D10, D12, D20 et D100, seuls ou combinés',
            'Modificateur, avantage et désavantage',
            'Tirage cryptographique uniforme, enregistré avant l’affichage',
            'Historique horodaté et export',
          ]}
        />
      </Sheet>

      <ConfirmDialog
        open={confirmPrep}
        title="Passer en mode Préparation ?"
        message={
          <>
            Le mode Préparation permet de créer et modifier les lieux, médias et réglages de la campagne.
            Pendant une partie, restez en mode Jeu : rien ne peut y être modifié par erreur.
          </>
        }
        confirmLabel="Passer en Préparation"
        onCancel={() => setConfirmPrep(false)}
        onConfirm={() => {
          setMode('preparation');
          setConfirmPrep(false);
        }}
      />

      <Dialog
        open={!settings.storageNoticeSeen && !!campaign}
        onClose={() => undefined}
        title="Où sont gardées vos données ?"
        actions={
          <Button variant="primary" onClick={() => void updateSettings({ storageNoticeSeen: true })}>
            J’ai compris
          </Button>
        }
      >
        <p>
          Le Grimoire enregistre tout <strong>sur cet appareil</strong>, dans le stockage du navigateur. Rien n’est envoyé
          sur internet.
        </p>
        <p className="mt-2">
          Ce stockage n’est pas une sauvegarde : désinstaller l’application ou effacer les données du navigateur
          supprime la campagne. Exportez régulièrement une sauvegarde depuis <strong>Réglages</strong>.
        </p>
      </Dialog>

      <Toaster />
    </div>
  );
}
