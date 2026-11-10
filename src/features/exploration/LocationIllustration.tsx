import type { Location } from '@/domain/schemas';
import { useMediaUrl } from '@/hooks/useMediaUrl';
import { PlaceholderArt } from '@/ui/PlaceholderArt';
import { cn } from '@/ui/cn';

/**
 * Grande illustration d'un lieu. Image importée si elle existe,
 * sinon un paysage provisoire signalé comme tel.
 */
export function LocationIllustration({ location, className }: { location: Location; className?: string }) {
  const url = useMediaUrl(location.imageId);
  const provisional = !location.imageId;

  return (
    <div key={location.id} className={cn('absolute inset-0 animate-fade-in overflow-hidden bg-leather-950', className)}>
      {url ? (
        <img src={url} alt={location.name} className="size-full animate-slow-zoom object-cover" draggable={false} />
      ) : provisional ? (
        <PlaceholderArt theme={location.theme} className="size-full animate-slow-zoom" />
      ) : null}
      {provisional && (
        <div className="absolute left-4 top-4 rounded-md border border-parchment-100/30 bg-leather-950/70 px-3 py-1.5 backdrop-blur-sm">
          <p className="font-display text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-parchment-100">
            Illustration provisoire
          </p>
          <p className="text-sm italic text-parchment-300">L’import d’images arrive en phase 2</p>
        </div>
      )}
    </div>
  );
}
