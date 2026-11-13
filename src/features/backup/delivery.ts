import { exportCampaign } from '@/services/backup/exportCampaign';
import { updateSettings } from '@/services/db/settings';
import { formatBytes } from '@/services/storage';
import { toast } from '@/stores/toasts';

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

/** L'appareil sait-il partager un fichier (Drive, e-mail…) ? */
export const canShareFiles = (() => {
  try {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.canShare?.({ files: [new File(['x'], 'test.zip', { type: 'application/zip' })] })
    );
  } catch {
    return false;
  }
})();

/**
 * Exporte une campagne (archive vérifiée) puis la remet à l'utilisateur : téléchargement ou partage.
 * Renvoie `false` si le partage a été annulé. Les erreurs sont laissées à l'appelant.
 */
export async function exportAndDeliver(campaignId: string, how: 'download' | 'share'): Promise<boolean> {
  const res = await exportCampaign(campaignId);
  if (how === 'share') {
    const file = new File([res.blob], res.filename, { type: 'application/zip' });
    try {
      await navigator.share({ files: [file], title: res.filename });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false; // partage annulé : pas d'export enregistré
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
  return true;
}
