import { useState, type ReactNode } from 'react';
import { applyBackup, describeError, readBackupFile, type ImportPreview } from '@/services/backup/importCampaign';
import { formatBytes } from '@/services/storage';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { exportAndDeliver } from './delivery';

export interface BackupImport {
  /** 'read' pendant la vérification du fichier, 'import' pendant l'écriture. */
  busy: null | 'read' | 'import' | 'export';
  /** Vérifie le fichier choisi puis demande confirmation. Rien n'est écrit avant. */
  pick: (file: File | undefined) => Promise<void>;
  /** Affiche une erreur dans la même fenêtre que celles de l'import (export raté, par exemple). */
  showError: (e: unknown) => void;
  /** Fenêtres de confirmation et d'erreur, à placer dans l'écran. */
  dialogs: ReactNode;
}

/**
 * Import d'une sauvegarde ou d'un pack de campagne, commun à l'accueil et aux Réglages :
 * vérification du fichier, aperçu, confirmation (remplacement signalé), puis écriture.
 */
export function useBackupImport({
  onImported,
  addedText,
}: {
  onImported: (campaignId: string, name: string) => void | Promise<void>;
  /** Phrase affichée quand la campagne n'existe pas encore sur l'appareil. */
  addedText: string;
}): BackupImport {
  const [busy, setBusy] = useState<BackupImport['busy']>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  const showError = (e: unknown) => setError(describeError(e));

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy('read');
    try {
      setPreview(await readBackupFile(file));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy('import');
    try {
      const id = await applyBackup(preview);
      await onImported(id, preview.backup.campaign.name);
      toast({ tone: 'success', title: preview.existing ? 'Sauvegarde restaurée' : 'Campagne importée', message: preview.backup.campaign.name });
      setPreview(null);
    } catch (e) {
      setPreview(null);
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  /** Met à l'abri la campagne qui va être remplacée (celle de l'appareil, pas celle du fichier). */
  const exportExisting = async () => {
    if (!preview?.existing) return;
    setBusy('export');
    try {
      await exportAndDeliver(preview.existing.id, 'download');
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const exportedAt = preview ? new Date(preview.backup.exportedAt) : null;

  const dialogs = (
    <>
      <Dialog
        open={!!preview}
        onClose={() => busy !== 'import' && setPreview(null)}
        title={preview?.existing ? 'Restaurer cette sauvegarde ?' : 'Importer cette campagne ?'}
        actions={
          <>
            <Button variant="ink" disabled={busy === 'import'} onClick={() => setPreview(null)}>
              Annuler
            </Button>
            {preview?.existing && (
              <Button variant="ink" disabled={!!busy} onClick={() => void exportExisting()}>
                Exporter d’abord l’actuelle
              </Button>
            )}
            <Button variant={preview?.existing ? 'danger' : 'primary'} disabled={!!busy} onClick={() => void confirm()}>
              {busy === 'import' ? 'Restauration…' : preview?.existing ? 'Remplacer' : 'Importer'}
            </Button>
          </>
        }
      >
        {preview && (
          <div className="space-y-2">
            <p>
              <strong>{preview.backup.campaign.name}</strong>
              <br />
              <span className="text-base text-ink-500">
                Exportée le {exportedAt?.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} (version{' '}
                {preview.backup.appVersion})
              </span>
            </p>
            <p className="text-base">
              {preview.counts.locations} lieu(x) · {preview.counts.media} média(s) ({formatBytes(preview.mediaBytes)}) ·{' '}
              {preview.counts.ambiances} ambiance(s) · {preview.counts.characters} fiche(s) · {preview.counts.items} objet(s) ·{' '}
              {preview.counts.journal} entrée(s) de journal
            </p>
            <p className="text-base text-forest-700">Fichier vérifié : sommes de contrôle et références cohérentes.</p>
            {preview.corrections.length > 0 && (
              <div className="rounded-md border border-ember-500/40 bg-ember-500/10 px-3 py-2 text-base text-ink-700">
                Corrections appliquées à l’import (éléments visant ce qui a été supprimé depuis) :
                <ul className="mt-1 list-disc pl-5">
                  {preview.corrections.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.existing ? (
              <p className="rounded-md border border-blood-500/40 bg-blood-500/10 px-3 py-2 text-base text-blood-600">
                Cette campagne existe déjà sur cet appareil (« {preview.existing.name} », modifiée le{' '}
                {new Date(preview.existing.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}).
                Elle sera <strong>entièrement remplacée</strong> par la sauvegarde, progression comprise (fiches,
                journal, inventaire).
              </p>
            ) : (
              <p className="text-base">{addedText}</p>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!error}
        onClose={() => setError(null)}
        title="Opération impossible"
        actions={
          <Button variant="primary" onClick={() => setError(null)}>
            Fermer
          </Button>
        }
      >
        <p>{error?.message}</p>
        {!!error?.details.length && (
          <ul className="mt-3 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-base text-ink-500">
            {error.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );

  return { busy, pick, showError, dialogs };
}
