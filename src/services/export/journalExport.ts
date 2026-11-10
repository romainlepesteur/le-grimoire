import { JOURNAL_KIND_LABELS, QUEST_STATUS_LABELS, type DiceRoll, type JournalEntry, type Location } from '@/domain/schemas';

/** Exports lisibles du journal et de l'historique des dés (fonctions pures). */

const fmtDate = (ms: number) => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function journalToMarkdown(campaignName: string, entries: JournalEntry[], locations: Map<string, Location>): string {
  const lines = [`# Journal — ${campaignName}`, '', `_Exporté le ${fmtDate(Date.now())}_`, ''];
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  for (const e of sorted) {
    const kind = JOURNAL_KIND_LABELS[e.kind];
    const title = e.title || `${kind} du ${new Date(e.createdAt).toLocaleDateString('fr-FR')}`;
    lines.push(`## ${title}`);
    const meta = [
      kind + (e.kind === 'quete' ? ` (${QUEST_STATUS_LABELS[e.questStatus].toLowerCase()})` : ''),
      e.gameDate && `date du monde : ${e.gameDate}`,
      e.locationId && locations.get(e.locationId) && `lieu : ${locations.get(e.locationId)!.name}`,
      `noté le ${fmtDate(e.createdAt)}`,
    ].filter(Boolean);
    lines.push(`_${meta.join(' · ')}_`, '');
    if (e.body) lines.push(e.body, '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function journalToJson(entries: JournalEntry[]): string {
  return JSON.stringify({ format: 'le-grimoire-journal', version: 1, entries: [...entries].sort((a, b) => a.createdAt - b.createdAt) }, null, 2);
}

export function diceHistoryToCsv(rolls: DiceRoll[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [['date', 'libellé', 'formule', 'dés', 'modificateur', 'total'].join(';')];
  for (const r of [...rolls].sort((a, b) => a.createdAt - b.createdAt)) {
    const dice = r.groups
      .map((g) => `d${g.sides}: ${g.values.map((v, i) => (g.kept && !g.kept.includes(i) ? `(${v})` : String(v))).join(' ')}`)
      .join(' | ');
    rows.push([esc(new Date(r.createdAt).toISOString()), esc(r.label), esc(r.formula), esc(dice), String(r.modifier), String(r.total)].join(';'));
  }
  return '﻿' + rows.join('\r\n') + '\r\n';
}

/** Téléchargement d'un texte (navigateur). */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'campagne'
  );
}
