import { useRef, useState } from 'react';
import { Download, Share2, Upload } from 'lucide-react';
import type { Campaign } from '@/domain/schemas';
import { canShareFiles, exportAndDeliver } from '@/features/backup/delivery';
import { useBackupImport } from '@/features/backup/useBackupImport';
import { useSettings } from '@/hooks/data';
import { updateSettings } from '@/services/db/settings';
import { useIsPrep, useSession } from '@/stores/session';
import { Button } from '@/ui/Button';
import { Panel, SectionTitle } from '@/ui/Panel';

function formatDate(ms: number | null) {
  if (ms == null) return 'jamais';
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

export function BackupSection({ campaign }: { campaign: Campaign }) {
  const settings = useSettings();
  const isPrep = useIsPrep();
  const setCampaignId = useSession((s) => s.setCampaignId);
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const imp = useBackupImport({
    addedText: 'Elle sera ajoutée à cet appareil et deviendra la campagne active.',
    onImported: async (id) => {
      await updateSettings({ activeCampaignId: id });
      setCampaignId(id);
    },
  });
  const busy = exporting ? 'export' : imp.busy;

  const runExport = async (how: 'download' | 'share') => {
    setExporting(true);
    try {
      await exportAndDeliver(campaign.id, how);
    } catch (e) {
      imp.showError(e);
    } finally {
      setExporting(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    await imp.pick(file);
    if (fileInput.current) fileInput.current.value = '';
  };

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

      {imp.dialogs}
    </Panel>
  );
}
