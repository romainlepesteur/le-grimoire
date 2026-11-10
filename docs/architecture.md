# Le Grimoire — architecture

Application web progressive (PWA) **entièrement locale** : aucun serveur applicatif, aucune API
payante, aucune donnée envoyée. Ce document décrit l'organisation du code, le modèle de données et
le chemin prévu vers un hébergement sur Proxmox.

## Vue d'ensemble

```
Navigateur (Chrome Android, tablette en paysage)
├── Service worker (Workbox)      → tous les fichiers en cache : fonctionnement hors ligne
├── React 19 + React Router       → écrans (chargés à la demande) et cadre permanent
├── Zustand                       → état d'interface (mode Jeu/Préparation, tiroirs, audio)
├── Dexie (IndexedDB)             → toutes les données de campagne, médias compris
├── Zod                           → schémas : types TypeScript + validation (saisies, sauvegardes)
├── Web Audio API                 → moteur d'ambiance multicouche (sans dépendance)
└── Leaflet (repère « image »)    → carte, marqueurs, brouillard (canevas)
```

## Organisation du code (`src/`)

| Dossier | Rôle |
|---|---|
| `app/` | démarrage, routes, cadre (barre latérale, barre inférieure), PWA, raccourcis |
| `domain/` | **logique pure, sans interface** : schémas, identifiants, hiérarchie des lieux, dés, jets, saisie rapide |
| `services/db/` | accès aux données (campagnes, lieux, médias, ambiances, cartes, partie) |
| `services/backup/` | format de sauvegarde `.zip`, export, import tout-ou-rien, compatibilité |
| `services/audio/` | moteur audio ; `services/media/` : préparation des images et sons |
| `features/` | un dossier par écran ou outil (exploration, carte, audio, fiches, inventaire, journal, dés, ajout rapide, réglages) |
| `ui/` | système visuel : panneaux, boutons, tiroirs, dialogues, champs, filet d'erreur |
| `stores/` | état d'interface (Zustand) |
| `test/` | configuration des tests et tests d'interface de bout en bout |

Règle : `domain/` ne dépend ni de React ni de la base ; c'est lui qui porte les règles (calcul d'un
jet, héritage d'ambiance, profondeur de hiérarchie…) et il est testé directement.

## Données

Une base IndexedDB (`le-grimoire`), une table par type. Toute ligne porte un **identifiant stable**
préfixé (`loc_…`, `med_…`, `chr_…`) qui ne change jamais, et un `campaignId`.

| Table | Contenu |
|---|---|
| `campaigns` | campagne, lieu et carte affichés, **règles de jeu** (`rules`) |
| `locations` | lieux (région › zone › lieu), illustration, ambiance |
| `mediaMeta` / `mediaBlobs` | métadonnées et contenu binaire des images et sons |
| `ambiances` | couches sonores (boucle / ponctuelle, bus musique / bruitages, volume) |
| `maps`, `markers`, `fogMasks` | cartes, marqueurs (caché / rumeur / connu), masque de brouillard (PNG) |
| `characters` | fiches : PV, états, bourse, caractéristiques, compétences, chance, traits |
| `items`, `journal`, `diceRolls` | inventaire, journal, historique des dés (500 derniers) |
| `settings` | réglages de l'appareil (volumes, écran allumé…), non exportés |

**Évolution du modèle.** Les nouveaux champs ont toujours une valeur par défaut :
- en lecture locale, des « hooks » Dexie complètent les anciennes lignes (`services/db/database.ts`) ;
- en sauvegarde, les schémas Zod appliquent les mêmes valeurs par défaut ;
- un changement de structure d'index passerait par une nouvelle `version(n)` de la base, jamais en
  modifiant une version publiée.

## Sauvegardes

Format `.zip` (écrivain et lecteur maison, sans compression des médias déjà compressés) :

```
grimoire.json   → { format, formatVersion, appVersion, dbVersion, exportedAt, campaign, tables }
media/<id>      → contenu binaire de chaque image ou son
LISEZMOI.txt    → explication lisible
```

L'import lit et **valide tout** avant d'écrire, vérifie l'espace disponible, puis remplace la campagne
en **une seule transaction**. `BACKUP_MIGRATIONS` transforme un ancien format vers le suivant.
Des sauvegardes de référence (`services/backup/__fixtures__`) garantissent, à chaque évolution, que
les anciennes sauvegardes sont relues à l'identique.

## Hors ligne et mises à jour

- `vite-plugin-pwa` (Workbox) précache **tous** les fichiers, y compris les écrans chargés à la
  demande et les bibliothèques (`vendor-react`, `vendor-motion`, `vendor-data`).
- Mises à jour en mode *prompt* : la nouvelle version attend l'accord de l'utilisateur (Réglages),
  jamais appliquée en pleine partie.
- Chemins relatifs (`base: './'`) et routage par `#` : l'application fonctionne à la racine d'un
  domaine comme dans un sous-dossier (GitHub Pages), sans configuration de serveur.

## Tests

- `npm test` : logique pure, services sur IndexedDB simulée (`fake-indexeddb`), compatibilité et
  intégrité des sauvegardes, écritures simultanées, et **tests d'intégration de l'interface**
  (`src/test/ui`, jsdom + Testing Library) qui pilotent l'application complète au clavier et à la souris.
  Ils ne remplacent pas un vrai navigateur : ni rendu visuel, ni service worker, ni moteur audio,
  ni gestes tactiles.
- Vérifications manuelles faites à chaque phase : navigateur réel, formats tablette (1280×800,
  1024×600), version de production hors ligne.

## Vers Proxmox

L'application est un ensemble de **fichiers statiques** (`dist/`). Trois étapes possibles, dans
l'ordre, chacune optionnelle :

1. **Héberger** : un conteneur LXC léger avec Caddy ou nginx servant `dist/`, en **HTTPS** (requis
   pour le service worker et l'installation). Aucune modification du code.
   ```
   # Caddyfile
   grimoire.maison.lan {
     root * /srv/grimoire
     file_server
   }
   ```
2. **Sauvegarde centralisée** : un petit service qui reçoit et stocke les `.zip` d'export (le format
   existe déjà, il est versionné et validé). L'application garde sa base locale.
3. **Synchronisation entre appareils** : les identifiants stables, les dates `updatedAt` et la
   séparation par `campaignId` permettent une synchronisation par campagne (dernier écrit gagnant
   par ligne, ou fusion par table). À concevoir seulement si plusieurs appareils deviennent utiles.

Dans tous les cas, la base locale reste la référence pendant une partie : le réseau ne doit jamais
être nécessaire pour jouer.
