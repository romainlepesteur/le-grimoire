import { Backpack, Map, ScrollText, Users } from 'lucide-react';
import { ComingSoon } from './ComingSoon';

export function MapPage() {
  return (
    <ComingSoon
      phase={3}
      icon={<Map className="size-7" strokeWidth={1.5} />}
      title="Carte du monde"
      features={[
        'Carte fictive zoomable et déplaçable au doigt',
        'Brouillard qui masque réellement les zones inconnues',
        'Pinceau de révélation (mode Préparation), plusieurs tailles',
        'Distinction zones explorées / lieux identifiés',
        'Marqueurs (dont rumeurs approximatives) reliés aux lieux',
      ]}
    />
  );
}

export function CharactersPage() {
  return (
    <ComingSoon
      phase={4}
      icon={<Users className="size-7" strokeWidth={1.5} />}
      title="Personnage et compagnons"
      features={[
        'Fiche du personnage principal avec portrait',
        'Caractéristiques configurables (système de règles libre)',
        'Compagnons : état, relation, événements connus',
        'Compagnon blessé, parti ou mort',
      ]}
    />
  );
}

export function InventoryPage() {
  return (
    <ComingSoon
      phase={4}
      icon={<Backpack className="size-7" strokeWidth={1.5} />}
      title="Inventaire"
      features={[
        'Armes, armures, potions, objets magiques, documents…',
        'Quantité, poids facultatif, propriétés, équipé ou non',
        'Monnaie',
      ]}
    />
  );
}

export function JournalPage() {
  return (
    <ComingSoon
      phase={4}
      icon={<ScrollText className="size-7" strokeWidth={1.5} />}
      title="Journal de campagne"
      features={[
        'Événements, rencontres, quêtes, décisions, rumeurs',
        'Dates fictives, recherche et filtres',
        'Export Markdown et JSON',
      ]}
    />
  );
}
