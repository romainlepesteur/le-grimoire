import { useEffect, useState } from 'react';
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
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Button } from '@/ui/Button';
import { ConfirmDialog, Dialog } from '@/ui/Dialog';
import { Sheet } from '@/ui/Sheet';
import { DicePanel } from '@/features/dice/DicePanel';
import { QuickCapture } from '@/features/quick/QuickCapture';
import { CheckDialog } from '@/features/characters/CheckDialog';
import { MixerSheet } from '@/features/audio/MixerSheet';
import { useAmbianceDirector } from '@/features/audio/useAmbianceDirector';

/**
 * Raccourcis clavier (sur ordinateur) : N = ajout rapide, D = dés.
 * Ignorés pendant la saisie dans un champ.
 */
function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const s = useSession.getState();
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        s.setDiceOpen(false);
        s.setQuickOpen(true);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        s.setQuickOpen(false);
        s.setDiceOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const BACKUP_REMINDER_MS = 3 * 24 * 60 * 60 * 1000;

export function AppShell() {
  const { mode, setMode, immersive, diceOpen, setDiceOpen } = useSession();
  const location = useLocation();
  const outlet = useOutlet();
  const settings = useSettings();
  const campaign = useActiveCampaign();
  const [confirmPrep, setConfirmPrep] = useState(false);
  useWakeLock(settings.wakeLock);
  useAmbianceDirector();
  useGlobalShortcuts();

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
              <ErrorBoundary key={location.pathname}>{outlet}</ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
        <StatusBar />
      </div>

      <Sheet open={diceOpen} onClose={() => setDiceOpen(false)} title="Dés" subtitle="Tirage aléatoire sûr, enregistré avant d’être affiché" sizeClass="w-[min(580px,96vw)]">
        <DicePanel />
      </Sheet>
      <QuickCapture />
      <CheckDialog />

      <MixerSheet />

      <ConfirmDialog
        open={confirmPrep}
        title="Passer en mode Préparation ?"
        message={
          <>
            Le mode Préparation permet de créer et modifier le monde : lieux, illustrations, cartes, brouillard et
            ambiances. Pendant une partie, restez en mode Jeu : dés, fiches, inventaire et journal y restent modifiables,
            mais le monde est protégé des erreurs.
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
