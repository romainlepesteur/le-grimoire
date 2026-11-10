import type { ReactNode } from 'react';
import { Hourglass } from 'lucide-react';
import { Badge } from '@/ui/Badge';
import { Divider, Panel } from '@/ui/Panel';
import { cn } from '@/ui/cn';

/** Emplacement d'une fonctionnalité prévue dans une phase ultérieure, clairement signalée. */
export function ComingSoon({
  phase,
  title,
  features,
  icon,
  compact,
}: {
  phase: number;
  title: string;
  features: string[];
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex h-full items-center justify-center', compact ? 'p-5' : 'p-8')}>
      <Panel ornate className={cn('w-full max-w-xl text-center', compact ? 'px-6 py-7' : 'px-10 py-10')}>
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full border border-bronze-500/50 text-bronze-600">
          {icon ?? <Hourglass className="size-7" strokeWidth={1.5} />}
        </div>
        <Badge tone="ink">Prévu en phase {phase}</Badge>
        <h1 className="mt-3 font-display text-2xl font-semibold text-ink-900">{title}</h1>
        <Divider className="my-5" />
        <ul className="space-y-1.5 text-left text-lg text-ink-700">
          {features.map((f) => (
            <li key={f} className="flex gap-2">
              <span className="text-bronze-600">◆</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-base italic text-ink-500">Cet écran n’est pas encore fonctionnel.</p>
      </Panel>
    </div>
  );
}
