import { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { newId } from '@/domain/ids';
import { formatMod } from '@/domain/checks';
import { rulesOf, type Rules } from '@/domain/schemas';
import { saveRules } from '@/services/db/play';
import { toast } from '@/stores/toasts';
import { Button, IconButton } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/Dialog';
import { Field, Select, TextInput } from '@/ui/Field';
import { SectionTitle } from '@/ui/Panel';
import { Sheet } from '@/ui/Sheet';

const DICE = [
  { v: '1d20', label: '1d20 — classique, résultats variés' },
  { v: '2d6', label: '2d6 — plus régulier, peu d’extrêmes' },
  { v: '3d6', label: '3d6 — très régulier' },
  { v: '1d12', label: '1d12' },
  { v: '1d10', label: '1d10' },
];

export function rulesSummary(r: Rules): string {
  return `${r.die.count}d${r.die.sides} + bonus · ${r.abilities.length} caractéristiques · ${r.skills.length} compétences · Formé ${formatMod(r.rankBonus[0])}, Expert ${formatMod(r.rankBonus[1])}${r.luck.enabled ? ' · points de chance' : ''}`;
}

/** Une ligne « nom + champ(s) + supprimer », pour les listes de l'éditeur. */
function Row({ children, onDelete, canDelete = true, deleteLabel }: { children: React.ReactNode; onDelete: () => void; canDelete?: boolean; deleteLabel: string }) {
  return (
    <li className="flex items-center gap-2">
      {children}
      <IconButton label={deleteLabel} onClick={onDelete} disabled={!canDelete}>
        <Trash2 className="size-5" />
      </IconButton>
    </li>
  );
}

/**
 * Règles de la campagne (mode Préparation) : dé, caractéristiques, compétences, rangs,
 * chance, types et états des traits. Les fiches existantes ne perdent rien : les valeurs
 * d'une caractéristique retirée sont simplement ignorées.
 */
export function RulesEditor({ open, onClose, campaignId, rules }: { open: boolean; onClose: () => void; campaignId: string; rules: Rules }) {
  const [draft, setDraft] = useState<Rules>(rules);
  const [wasOpen, setWasOpen] = useState(open);
  const [confirmReset, setConfirmReset] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(rules);
  }
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const usedAbility = (id: string) => draft.skills.some((s) => s.abilityId === id) || draft.luck.abilityId === id;

  const save = async () => {
    try {
      await saveRules(campaignId, draft);
      toast({ tone: 'success', title: 'Règles enregistrées' });
      onClose();
    } catch (e) {
      toast({ tone: 'error', title: 'Règles invalides', message: (e as Error).message });
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Règles de la campagne"
      subtitle="Configurables à tout moment : renommer ne casse ni les fiches ni l’historique."
      sizeClass="w-[min(720px,96vw)]"
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" icon={<RotateCcw className="size-5" />} onClick={() => setConfirmReset(true)}>
            Règles par défaut
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <div className="space-y-6 px-5 py-4">
        <section className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Dé de résolution" hint="Résultat = dé + modificateur + rang + bonus.">
            <Select
              value={`${draft.die.count}d${draft.die.sides}`}
              onChange={(e) => {
                const [c, s] = e.target.value.split('d').map(Number);
                set('die', { count: c, sides: s });
              }}
            >
              {DICE.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Formé">
            <TextInput inputMode="numeric" className="w-20 text-center" value={draft.rankBonus[0]} onChange={(e) => set('rankBonus', [parseInt(e.target.value, 10) || 0, draft.rankBonus[1]])} />
          </Field>
          <Field label="Expert">
            <TextInput inputMode="numeric" className="w-20 text-center" value={draft.rankBonus[1]} onChange={(e) => set('rankBonus', [draft.rankBonus[0], parseInt(e.target.value, 10) || 0])} />
          </Field>
        </section>

        <section>
          <SectionTitle className="text-bronze-400">Caractéristiques (score 1 à 20, modificateur calculé)</SectionTitle>
          <ul className="mt-2 space-y-1.5">
            {draft.abilities.map((a, i) => (
              <Row
                key={a.id}
                deleteLabel={usedAbility(a.id) ? 'Utilisée par une compétence ou la chance' : `Retirer ${a.name}`}
                canDelete={draft.abilities.length > 1 && !usedAbility(a.id)}
                onDelete={() => set('abilities', draft.abilities.filter((_, j) => j !== i))}
              >
                <TextInput value={a.name} maxLength={40} className="h-11 flex-1" aria-label="Nom" onChange={(e) => set('abilities', draft.abilities.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <TextInput value={a.abbr} maxLength={6} className="h-11 w-24 text-center uppercase" aria-label="Abréviation" onChange={(e) => set('abilities', draft.abilities.map((x, j) => (j === i ? { ...x, abbr: e.target.value.toUpperCase() } : x)))} />
              </Row>
            ))}
          </ul>
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} className="mt-1" onClick={() => set('abilities', [...draft.abilities, { id: newId('rule'), name: 'Nouvelle', abbr: 'NOU' }])}>
            Ajouter une caractéristique
          </Button>
        </section>

        <section>
          <SectionTitle className="text-bronze-400">Compétences</SectionTitle>
          <ul className="mt-2 space-y-1.5">
            {draft.skills.map((s, i) => (
              <Row key={s.id} deleteLabel={`Retirer ${s.name}`} onDelete={() => set('skills', draft.skills.filter((_, j) => j !== i))}>
                <TextInput value={s.name} maxLength={60} className="h-11 flex-1" aria-label="Nom" onChange={(e) => set('skills', draft.skills.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <Select value={s.abilityId} className="h-11 w-44 text-base" aria-label="Caractéristique liée" onChange={(e) => set('skills', draft.skills.map((x, j) => (j === i ? { ...x, abilityId: e.target.value } : x)))}>
                  {draft.abilities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Row>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            icon={<Plus className="size-4" />}
            className="mt-1"
            onClick={() => set('skills', [...draft.skills, { id: newId('rule'), name: 'Nouvelle compétence', abilityId: draft.abilities[0].id }])}
          >
            Ajouter une compétence
          </Button>
        </section>

        <section className="space-y-2">
          <SectionTitle className="text-bronze-400">Chance</SectionTitle>
          <label className="flex min-h-11 items-center gap-3 text-lg text-parchment-100">
            <input type="checkbox" className="size-6 accent-[var(--color-gold-300)]" checked={draft.luck.enabled} onChange={(e) => set('luck', { ...draft.luck, enabled: e.target.checked })} />
            Points de chance (relancer un jet, garder le meilleur)
          </label>
          {draft.luck.enabled && (
            <Field label="Caractéristique qui fixe le maximum (1 + son modificateur, au moins 1)">
              <Select value={draft.luck.abilityId} onChange={(e) => set('luck', { ...draft.luck, abilityId: e.target.value })}>
                {draft.abilities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <p className="text-sm text-parchment-400">Aucune récupération automatique : elle se fait à la main sur la fiche, quand le MJ l’accorde.</p>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div>
            <SectionTitle className="text-bronze-400">Types de traits</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {draft.traitKinds.map((k, i) => (
                <Row key={k.id} deleteLabel={`Retirer ${k.name}`} canDelete={draft.traitKinds.length > 1} onDelete={() => set('traitKinds', draft.traitKinds.filter((_, j) => j !== i))}>
                  <TextInput value={k.name} maxLength={40} className="h-11 flex-1" aria-label="Nom du type" onChange={(e) => set('traitKinds', draft.traitKinds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                </Row>
              ))}
            </ul>
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} className="mt-1" onClick={() => set('traitKinds', [...draft.traitKinds, { id: newId('rule'), name: 'Nouveau type' }])}>
              Ajouter un type
            </Button>
          </div>
          <div>
            <SectionTitle className="text-bronze-400">États des traits</SectionTitle>
            <ul className="mt-2 space-y-1.5">
              {draft.traitStates.map((s, i) => (
                <Row key={s.id} deleteLabel={`Retirer ${s.name}`} canDelete={draft.traitStates.length > 1} onDelete={() => set('traitStates', draft.traitStates.filter((_, j) => j !== i))}>
                  <TextInput value={s.name} maxLength={40} className="h-11 flex-1" aria-label="Nom de l’état" onChange={(e) => set('traitStates', draft.traitStates.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <label className="flex shrink-0 items-center gap-2 text-sm text-parchment-300" title="Les effets mécaniques s’appliquent dans cet état">
                    <input type="checkbox" className="size-5 accent-[var(--color-gold-300)]" checked={s.effects} onChange={(e) => set('traitStates', draft.traitStates.map((x, j) => (j === i ? { ...x, effects: e.target.checked } : x)))} />
                    effets
                  </label>
                </Row>
              ))}
            </ul>
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} className="mt-1" onClick={() => set('traitStates', [...draft.traitStates, { id: newId('rule'), name: 'Nouvel état', effects: false }])}>
              Ajouter un état
            </Button>
          </div>
        </section>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title="Revenir aux règles par défaut ?"
        message="Caractéristiques, compétences, rangs, chance et traits reprennent leurs valeurs d’origine (rien n’est enregistré avant « Enregistrer »). Les valeurs des fiches sont conservées."
        confirmLabel="Rétablir"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          setDraft(rulesOf(undefined));
        }}
      />
    </Sheet>
  );
}
