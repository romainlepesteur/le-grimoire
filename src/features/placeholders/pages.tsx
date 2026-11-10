import { Backpack, ScrollText, Users } from 'lucide-react';
import { ComingSoon } from './ComingSoon';

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
