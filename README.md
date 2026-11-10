# Le Grimoire

Application compagnon pour une campagne de jeu de rôle fantasy : lieux illustrés, ambiances sonores,
carte avec brouillard de découverte, fiches, dés, inventaire et journal.

- **Locale et hors ligne** : PWA installable, toutes les données restent sur l’appareil (IndexedDB).
- **Aucun serveur, aucun abonnement, aucune IA** : l’application ne raconte rien, elle accompagne le MJ.
- **Pensée pour tablette Android en paysage**, utilisable sur ordinateur.

## État d’avancement

| Phase | Contenu | État |
|---|---|---|
| 1 — Fondations | Projet, design system, navigation, stockage local, PWA, modes Jeu/Préparation, export/import | ✅ terminée |
| 2 — Immersion | Création/édition des lieux, import d’illustrations, moteur audio multicouche, ambiances | ✅ terminée |
| 3 — Carte | Carte interactive, marqueurs, brouillard, révélation au pinceau | ✅ terminée |
| 4 — Outils JDR | Dés, fiches, compagnons, inventaire, journal | à faire |
| 5 — Finalisation | Tests de bout en bout, optimisation, documentation complète | à faire |

Les écrans des phases suivantes sont présents mais affichent clairement « Prévu en phase N ».

## Développement (Windows)

Prérequis : [Node.js LTS](https://nodejs.org) et Git.

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173, accessible sur le réseau local)
npm test           # tests unitaires
npm run build      # version de production dans dist/
npm run preview    # sert dist/ (http://localhost:4173) — permet de tester le hors-ligne
```

## Publication sur GitHub Pages

1. Créer un dépôt GitHub et y pousser ce projet (branche `main`).
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Chaque push sur `main` lance les tests, construit et publie l’application
   (`.github/workflows/deploy.yml`).
4. Sur la tablette, ouvrir l’adresse `https://<utilisateur>.github.io/<depot>/` dans Chrome,
   puis **⋮ → Ajouter à l’écran d’accueil / Installer l’application**.

Une fois installée, l’application fonctionne sans connexion. Les mises à jour sont proposées
(Réglages → Mettre à jour) et jamais imposées en pleine partie.

## Structure

```
src/
  app/          démarrage, routes, cadre (barre latérale, barre inférieure), PWA
  ui/           design system : Panel, Button, Sheet, Dialog, Badge, illustrations provisoires…
  domain/       modèles de données (schémas Zod = types + validation), identifiants
  services/
    db/         IndexedDB (Dexie) : schéma versionné, accès aux campagnes, lieux, médias, réglages
    backup/     export/import des sauvegardes (.zip : grimoire.json + media/)
    storage.ts  quota, stockage persistant
  features/     écrans : exploration, réglages, (phases suivantes)
  hooks/        accès réactif aux données, écran allumé, plein écran
  stores/       état d’interface (Zustand) : mode Jeu/Préparation, notifications, PWA
  data/demo/    campagne d’exemple (Valdoren), marquée « Exemple »
scripts/        génération des icônes
```

## Sauvegardes

Réglages → **Exporter la campagne** produit un `.zip` contenant toutes les données (`grimoire.json`)
et tous les médias (`media/`). L’import (mode Préparation) vérifie entièrement le fichier avant
toute écriture, puis remplace la campagne en une seule opération (tout ou rien).

⚠️ Le stockage du navigateur n’est pas une sauvegarde : désinstaller l’application ou effacer
les données de Chrome supprime la campagne. Exportez régulièrement et gardez le fichier ailleurs.

## Carte

Écran **Carte** : une ou plusieurs cartes importées (monde, région, plan de ville), zoomables au doigt.

- **Brouillard** (exploration géographique) : il recouvre toute la carte ; en mode Préparation, le
  pinceau **Révéler** le dissipe au fil de l'exploration, **Recouvrir** le remet, avec annulation ;
  **Révéler autour de la position** dissipe d'un coup un disque de rayon réglable autour du lieu actuel.
- **Marqueurs** (découverte des lieux), indépendants du brouillard : un lieu peut être **caché**
  (invisible pour le joueur), connu par **rumeur** (une zone approximative, volontairement décentrée)
  ou **connu** (position exacte). Se rendre dans un lieu le rend connu automatiquement.
- **Voir comme le joueur** : aperçu exact du mode Jeu depuis la Préparation.
- En mode Jeu, la carte se consulte seulement. Toucher un lieu ouvre sa fiche sans rien changer :
  déplacer le personnage demande une confirmation explicite (à faire quand le MJ l'annonce).

## Contenus

Aucune illustration n’est fournie : tant qu’un lieu n’a pas d’image, un cadre sobre « Aucune
illustration » s’affiche. Le guide [docs/illustrations.md](docs/illustrations.md) donne une charte
visuelle commune et des prompts prêts à l’emploi pour générer des images réalistes et cohérentes.
Les illustrations s’importent en mode Préparation (panneau du lieu → **Modifier**) ; elles sont
redimensionnées (2560 px au plus) et converties en WebP sur l’appareil.

Aucune musique n’est fournie : importez vos fichiers dans **Ambiances → Sons** (mode Préparation).
Une ambiance mélange plusieurs couches jouées ensemble :

- **en boucle** : musique (lue en flux) ou fond sonore (pluie, feu, foule — décodé pour boucler sans coupure) ;
- **ponctuelle** : un son court rejoué au hasard (« toutes les 20 à 60 s »), avec une légère variation.

Chaque lieu peut avoir son ambiance ; ses sous-lieux en héritent. Changer de lieu fait un fondu
enchaîné, et une boucle commune à deux ambiances continue sans coupure. Pendant la partie, la barre
inférieure permet de régler les volumes (général, musique, bruitages) et de choisir une autre
ambiance (combat, tension…) jusqu’au prochain changement de lieu. Les navigateurs exigent un toucher
avant de jouer du son : bouton **Activer l’ambiance sonore**.

Les animations (fondus, tiroirs, poussières en suspension) se coupent automatiquement si l’appareil
est réglé sur « réduire les animations » ; les effets d’ambiance sont désactivables dans Réglages.
