import { MAX_LOCATION_DEPTH } from '@/domain/schemas';
import type { Backup } from './format';

/**
 * Cohérence des références d'une sauvegarde (fonction pure, sans accès à la base).
 *
 * - Références STRUCTURELLES (parent d'un lieu, image d'une carte, carte d'un marqueur, média
 *   d'une couche sonore…) : si l'une est cassée, l'archive est refusée — la restaurer produirait
 *   une campagne bancale.
 * - Références d'HISTORIQUE (lieu où un objet a été trouvé, lieu d'une note, personnage d'un
 *   ancien jet, lieu ou carte affichés) : elles peuvent légitimement viser un élément supprimé
 *   depuis. Elles sont remises à vide, et la correction est signalée.
 */
export interface IntegrityReport {
  errors: string[];
  fixes: string[];
  backup: Backup;
}

export function checkIntegrity(input: Backup): IntegrityReport {
  const b: Backup = structuredClone(input);
  const t = b.tables;
  const errors: string[] = [];
  const fixes: string[] = [];

  const media = new Map(t.mediaMeta.map((m) => [m.id, m]));
  const locations = new Map(t.locations.map((l) => [l.id, l]));
  const ambiances = new Set(t.ambiances.map((a) => a.id));
  const maps = new Set(t.maps.map((m) => m.id));
  const characters = new Set(t.characters.map((c) => c.id));
  const needMedia = (id: string | null, kind: 'image' | 'audio', what: string) => {
    if (!id) return;
    const m = media.get(id);
    if (!m) errors.push(`${what} : média introuvable`);
    else if (m.kind !== kind) errors.push(`${what} : le média n’est pas ${kind === 'image' ? 'une image' : 'un son'}`);
  };

  // Lieux : parent existant, pas de boucle, trois niveaux au plus.
  for (const l of t.locations) {
    if (l.parentId && !locations.has(l.parentId)) errors.push(`lieu « ${l.name} » : lieu parent introuvable`);
    const seen = new Set<string>([l.id]);
    let depth = 1;
    let p = l.parentId ? locations.get(l.parentId) : undefined;
    while (p) {
      if (seen.has(p.id)) {
        errors.push(`lieu « ${l.name} » : la hiérarchie des lieux forme une boucle`);
        break;
      }
      seen.add(p.id);
      depth++;
      p = p.parentId ? locations.get(p.parentId) : undefined;
    }
    if (depth > MAX_LOCATION_DEPTH) errors.push(`lieu « ${l.name} » : plus de ${MAX_LOCATION_DEPTH} niveaux`);
    needMedia(l.imageId, 'image', `illustration du lieu « ${l.name} »`);
    if (l.ambianceId && !ambiances.has(l.ambianceId)) errors.push(`lieu « ${l.name} » : ambiance introuvable`);
  }
  for (const a of t.ambiances) for (const layer of a.layers) needMedia(layer.mediaId, 'audio', `ambiance « ${a.name} »`);
  for (const m of t.maps) needMedia(m.imageId, 'image', `carte « ${m.name} »`);
  for (const mk of t.markers) {
    if (!maps.has(mk.mapId)) errors.push(`marqueur ${mk.label || mk.id} : carte introuvable`);
    if (mk.locationId && !locations.has(mk.locationId)) errors.push(`marqueur ${mk.label || mk.id} : lieu introuvable`);
  }
  for (const f of t.fogMasks) if (!maps.has(f.mapId)) errors.push(`brouillard ${f.id} : carte introuvable`);
  for (const c of t.characters) needMedia(c.portraitId, 'image', `portrait de « ${c.name} »`);

  // Règles : chaque compétence et la chance visent une caractéristique existante.
  const rules = b.campaign.rules;
  const abilityIds = new Set(rules.abilities.map((a) => a.id));
  for (const s of rules.skills) if (!abilityIds.has(s.abilityId)) errors.push(`règles : la compétence « ${s.name} » vise une caractéristique absente`);
  if (rules.luck.enabled && !abilityIds.has(rules.luck.abilityId)) errors.push('règles : la chance vise une caractéristique absente');

  // Références d'historique : remises à vide si l'élément visé n'existe plus.
  if (b.campaign.currentLocationId && !locations.has(b.campaign.currentLocationId)) {
    b.campaign.currentLocationId = null;
    fixes.push('lieu actuel introuvable : aucun lieu sélectionné');
  }
  if (b.campaign.currentMapId && !maps.has(b.campaign.currentMapId)) {
    b.campaign.currentMapId = null;
    fixes.push('carte affichée introuvable : première carte affichée');
  }
  let n = 0;
  for (const it of t.items) {
    if (it.ownerId && !characters.has(it.ownerId)) {
      it.ownerId = null;
      n++;
    }
    if (it.foundAtId && !locations.has(it.foundAtId)) it.foundAtId = null;
  }
  if (n) fixes.push(`${n} objet(s) d’un porteur disparu placé(s) dans le sac commun`);
  for (const e of t.journal) if (e.locationId && !locations.has(e.locationId)) e.locationId = null;
  for (const r of t.diceRolls) if (r.characterId && !characters.has(r.characterId)) r.characterId = null;

  return { errors, fixes, backup: b };
}
