import { useRef, useState } from 'react';
import { Download, Share2, Upload } from 'lucide-react';
import type { Campaign } from '@/domain/schemas';
import { useSettings } from '@/hooks/data';
import { exportCampaign } from '@/services/backup/exportCampaign';
import { applyBackup, describeError, readBackupFile, type ImportPreview } from '@/services/backup/importCampaign';
import { updateSettings } from '@/services/db/settings';
import { formatBytes } from '@/services/storage';
import { useIsPrep, useSession } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { Panel, SectionTitle } from '@/ui/Panel';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const canShareFiles = (() => {
  try {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.canShare?.({ files: [new File(['x'], 'test.zip', { type: 'application/zip' })] })
    );
  } catch {
    return false;
  }
})();

function formatDate(ms: number | null) {
  if (ms == null) return 'jamais';
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

export function BackupSection({ campaign }: { campaign: Campaign }) {
  const settings = useSettings();
  const isPrep = useIsPrep();
  const setCampaignId = useSession((s) => s.setCampaignId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | 'export' | 'read' | 'import'>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);

  const runExport = async (how: 'download' | 'share') => {
    setBusy('export');
    try {
      const res = await exportCampaign(campaign.id);
      if (how === 'share') {
        const file = new File([res.blob], res.filename, { type: 'application/zip' });
        try {
          await navigator.share({ files: [file], title: res.filename });
        } catch (e) {
          if ((e as Error).name === 'AbortError') return; // partage annulé : pas d'export enregistré
          throw e;
        }
      } else {
        download(res.blob, res.filename);
      }
      await updateSettings({ lastExportAt: Date.now() });
      if (res.partial) {
        // Restaurable, mais incomplète : on le dit clairement, et le message reste affiché.
        toast({
          tone: 'warning',
          duration: 0,
          title: 'Sauvegarde PARTIELLE exportée',
          message: `${res.missingMedia.length} média(s) dont le fichier manque sur cet appareil ont été retirés de l’archive (${res.missingMedia
            .slice(0, 4)
            .join(', ')}${res.missingMedia.length > 4 ? '…' : ''}). Tout le reste est sauvegardé et restaurable.`,
        });
      } else {
        toast({
          tone: 'success',
          title: 'Sauvegarde exportée et vérifiée',
          message: `${res.filename} — ${formatBytes(res.blob.size)}, ${res.mediaCount} média(s).`,
        });
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy('read');
    try {
      setPreview(await readBackupFile(file));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy('import');
    try {
      const id = await applyBackup(preview);
      await updateSettings({ activeCampaignId: id });
      setCampaignId(id);
      toast({ tone: 'success', title: 'Sauvegarde restaurée', message: preview.backup.campaign.name });
      setPreview(null);
    } catch (e) {
      setPreview(null);
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const exportedAt = preview ? new Date(preview.backup.exportedAt) : null;

  return (
    <Panel className="px-6 py-5">
      <SectionTitle className="text-bronze-700">Sauvegarde</SectionTitle>
      <p className="mt-2 text-lg text-ink-700">
        Dernier export : <strong>{formatDate(settings.lastExportAt)}</strong>
      </p>
      <p className="text-base text-ink-500">
        L’archive (.zip) contient toute la campagne : données et médias. Conservez-la hors de la tablette (PC, clé USB,
        Drive…).
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="primary"
          icon={<Download className="size-5" />}
          disabled={!!busy}
          onClick={() => void runExport('download')}
        >
          {busy === 'export' ? 'Préparation…' : 'Exporter la campagne'}
        </Button>
        {canShareFiles && (
          <Button variant="ink" icon={<Share2 className="size-5" />} disabled={!!busy} onClick={() => void runExport('share')}>
            Envoyer vers… (Drive, e-mail)
          </Button>
        )}
      </div>

      <div className="mt-5 border-t border-ink-700/15 pt-4">
        <p className="text-lg font-semibold text-ink-900">Restaurer une sauvegarde</p>
        {isPrep ? (
          <>
            <p className="text-base text-ink-500">
              Le fichier est vérifié avant toute modification. Si la campagne existe déjà sur cet appareil, elle sera
              remplacée après confirmation.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <Button
              variant="ink"
              className="mt-3"
              icon={<Upload className="size-5" />}
              disabled={!!busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy === 'read' ? 'Vérification…' : 'Importer une sauvegarde'}
            </Button>
          </>
        ) : (
          <p className="text-base italic text-ink-500">Disponible en mode Préparation (protection contre les fausses manipulations).</p>
        )}
      </div>

      <Dialog
        open={!!preview}
        onClose={() => busy !== 'import' && setPreview(null)}
        title="Restaurer cette sauvegarde ?"
        actions={
          <>
            <Button variant="ink" disabled={busy === 'import'} onClick={() => setPreview(null)}>
              Annuler
            </Button>
            {preview?.existing && (
              <Button variant="ink" disabled={!!busy} onClick={() => void runExport('download')}>
                Exporter d’abord l’actuelle
              </Button>
            )}
            <Button variant={preview?.existing ? 'danger' : 'primary'} disabled={!!busy} onClick={() => void confirmImport()}>
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
                Elle sera <strong>entièrement remplacée</strong> par la sauvegarde.
              </p>
            ) : (
              <p className="text-base">Elle sera ajoutée à cet appareil et deviendra la campagne active.</p>
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
    </Panel>
  );
}
