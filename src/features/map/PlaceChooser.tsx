import { useMemo, useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { MARKER_STATUSES, MARKER_STATUS_LABELS, type Location, type MarkerStatus } from '@/domain/schemas';
import { depthOf } from '@/domain/locationTree';
import { sortLocations } from '@/services/db/locations';
import { Button } from '@/ui/Button';
import { Field, Select, TextInput } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';

export interface PlaceChoice {
  locationId: string | null;
  label: string;
  status: MarkerStatus;
}

/**
 * Après un toucher sur la carte en mode « Placer » : quel lieu se trouve ici ?
 * Les lieux déjà présents sur cette carte ne sont pas proposés.
 */
export function PlaceChooser({
  open,
  locations,
  placedIds,
  onChoose,
  onClose,
}: {
  open: boolean;
  locations: Location[];
  placedIds: Set<string>;
  onChoose: (c: PlaceChoice) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<MarkerStatus>('connu');
  const [label, setLabel] = useState('');

  const ordered = useMemo(() => {
    // Ordre de lecture : région, ses zones, leurs lieux.
    const out: { loc: Location; depth: number }[] = [];
    const visit = (parentId: string | null) => {
      for (const l of sortLocations(locations.filter((x) => x.parentId === parentId))) {
        out.push({ loc: l, depth: depthOf(l.id, locations) });
        visit(l.id);
      }
    };
    visit(null);
    return out;
  }, [locations]);

  const available = ordered.filter((o) => !placedIds.has(o.loc.id));

  return (
    <Sheet open={open} onClose={onClose} title="Placer un marqueur ici" subtitle="Choisissez le lieu situé à cet endroit.">
      <div className="space-y-5 px-5 py-4">
        <Field label="Ce que le joueur en sait">
          <Select value={status} onChange={(e) => setStatus(e.target.value as MarkerStatus)}>
            {MARKER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MARKER_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>

        <section>
          <SectionTitle className="text-bronze-400">Lieux de la campagne</SectionTitle>
          <ul className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
            {available.map(({ loc, depth }) => (
              <li key={loc.id}>
                <button
                  type="button"
                  onClick={() => onChoose({ locationId: loc.id, label: '', status })}
                  className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-parchment-100 transition-colors hover:bg-parchment-100/8 active:scale-[0.99]"
                  style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
                >
                  <MapPin className="size-4 shrink-0 text-bronze-400" />
                  <span className={depth === 0 ? 'font-display text-lg tracking-wide' : 'text-lg'}>{loc.name}</span>
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <li className="px-3 py-2 text-base italic text-parchment-400">Tous les lieux sont déjà sur cette carte.</li>
            )}
          </ul>
        </section>

        <section>
          <SectionTitle className="text-bronze-400">Ou un simple point d’intérêt</SectionTitle>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (label.trim()) onChoose({ locationId: null, label: label.trim(), status });
            }}
          >
            <TextInput value={label} maxLength={200} placeholder="Ex. : Tour en ruine aperçue au loin" onChange={(e) => setLabel(e.target.value)} />
            <Button type="submit" icon={<Plus className="size-5" />} disabled={!label.trim()}>
              Placer
            </Button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}
