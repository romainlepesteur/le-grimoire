import { db } from './database';
import { newId } from '@/domain/ids';
import type { MediaKind, MediaMeta } from '@/domain/schemas';

export async function getMediaBlob(id: string): Promise<Blob | undefined> {
  return (await db.mediaBlobs.get(id))?.blob;
}

/** Enregistre un fichier importé (image ou son) dans la base locale. */
export async function addMedia(
  campaignId: string,
  file: Blob & { name?: string },
  kind: MediaKind,
  extra: Partial<Pick<MediaMeta, 'width' | 'height' | 'duration'>> = {},
): Promise<MediaMeta> {
  const meta: MediaMeta = {
    id: newId('media'),
    campaignId,
    kind,
    name: file.name ?? 'sans-nom',
    mime: file.type || 'application/octet-stream',
    size: file.size,
    width: extra.width ?? null,
    height: extra.height ?? null,
    duration: extra.duration ?? null,
    createdAt: Date.now(),
  };
  await db.transaction('rw', db.mediaMeta, db.mediaBlobs, async () => {
    await db.mediaMeta.add(meta);
    await db.mediaBlobs.add({ id: meta.id, campaignId, blob: file });
  });
  return meta;
}
