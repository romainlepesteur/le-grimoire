import { useEffect, useState } from 'react';
import { getMediaBlob } from '@/services/db/media';

/** URL temporaire (blob:) d'un média stocké localement ; libérée automatiquement. */
export function useMediaUrl(mediaId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!mediaId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    getMediaBlob(mediaId).then((blob) => {
      if (cancelled || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [mediaId]);
  return url;
}
