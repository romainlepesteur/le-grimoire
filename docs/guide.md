# Le Grimoire — guide d'utilisation

Le Grimoire accompagne une campagne de jeu de rôle dont le MJ est ailleurs (ChatGPT, à la voix, sur
le téléphone). Il **ne raconte rien, n'invente rien et ne révèle rien** : il affiche les lieux, joue les
ambiances, tient la carte, les fiches, l'inventaire et le journal, et lance les dés.

---

## 1. Installer sur la tablette

1. Sur la tablette, ouvrir l'adresse de l'application dans **Chrome** (GitHub Pages, voir le README).
2. Menu **⋮ → Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Lancer Le Grimoire depuis son icône : il s'ouvre en plein écran, en paysage.
4. Une fois ouvert une première fois, **tout fonctionne sans connexion**.

> Tout est enregistré **sur la tablette**. Désinstaller l'application ou effacer les données de
> Chrome efface la campagne : exportez une sauvegarde régulièrement (voir § 7).

## 2. Les deux modes

| Mode | Pour quoi | Ce qui est modifiable |
|---|---|---|
| **Jeu** (au démarrage) | jouer | dés, fiches (PV, états, bourse, notes, traits), inventaire, journal, choix d'ambiance |
| **Préparation** (bouton en bas à gauche, avec confirmation) | préparer le monde | lieux, illustrations, cartes, brouillard, marqueurs, sons, ambiances, règles de jeu |

L'application **redémarre toujours en mode Jeu** : le monde ne peut pas être modifié par erreur en
pleine partie.

## 3. Pendant la partie

- **Changer de lieu** : panneau du lieu → *Changer de lieu* (région › zone › lieu, favoris, récents).
  L'illustration et l'ambiance changent en fondu.
- **Noter** (barre du bas, ou touche **N** au clavier) — le geste le plus rapide :
  - *Objet* : tapez « une vieille clé », « 3 torches », « potion de soin x2 », puis Entrée.
    Quantité et catégorie sont comprises ; un objet déjà porté est cumulé ; *Annuler* dans la
    notification.
  - *Note* : une ligne pour le journal (rattachée au lieu actuel).
  - *Points de vie* : −5 −1 +1 +5 ou une valeur libre (« −7 »), pour tout le groupe.
- **Dés** (barre du bas, ou touche **D**) : d4 à d100, modificateur, avantage, formule libre
  (« 2d6+3 »). Chaque tirage est enregistré **avant** d'être affiché ; historique exportable.
- **Jet de caractéristique ou de compétence** : écran *Fiches*, touchez le médaillon ou la
  compétence. Réglez si besoin avantage, circonstance et **difficulté annoncée par le MJ** ;
  le résultat détaille le calcul et affiche *Réussite* ou *Échec*.
- **Chance** : après un jet, *Relancer avec la chance* dépense un point et garde le meilleur
  des deux jets. Les points ne reviennent **que** par *Récupérer…*, quand le MJ l'accorde.
- **Ambiance sonore** : touchez *Activer l'ambiance sonore* une fois par session (exigence des
  navigateurs). La barre du bas règle les volumes et permet de choisir une autre ambiance (combat,
  tension…) jusqu'au prochain lieu.
- **Carte** : consultation seulement. Toucher un lieu ouvre sa fiche ; *Déplacer le personnage
  ici…* demande confirmation (seulement si le MJ vous y amène). *Où suis-je ?* recentre la carte.

## 4. Fiches, règles et traits

- **Caractéristiques** (score 1–20, modificateur calculé : 10 → +0, 14 → +2) et **compétences**
  (rang Formé +2, Expert +4, bonus divers). Bouton *Modifier* pour ajuster scores et rangs.
- **Traits** (héritage, aptitude, particularité, spécialisation, capacité magique…) : nom,
  description, état *Latent / Éveillé / Actif / Maîtrisé / Inactif*, effets saisis à la main
  (comptés seulement dans un état actif), utilisations limitées. Changer l'état d'un trait
  ajoute une ligne à son **historique d'évolution**, avec une remarque facultative.
- **Règles de jeu** (Réglages, mode Préparation) : dé de résolution, liste des caractéristiques et
  compétences, valeur des rangs, chance, types et états des traits. Renommer ne casse rien.

## 5. Préparer le monde (mode Préparation)

- **Lieux** : crayon *Modifier ce lieu* ou bouton **+** sur l'Exploration ; ou depuis *Changer de
  lieu* (« Nouvelle région », « Zone dans… », « Lieu dans… »). Trois niveaux : région › zone › lieu.
- **Illustrations** : dans l'éditeur de lieu, *Importer une illustration* (optimisée sur la
  tablette). Prompts prêts à l'emploi : [docs/illustrations.md](illustrations.md).
- **Ambiances** : écran *Ambiances* → onglet *Sons* (importer MP3/OGG) → *Nouvelle ambiance* :
  couches en boucle (musique, pluie, feu) ou ponctuelles (corbeau, cloche, toutes les 20 à 60 s).
  Un lieu sans ambiance prend celle de son parent.
- **Carte** : *Cartes* → importer une image. Outils : *Révéler* / *Recouvrir* au pinceau,
  *Révéler autour de la position* (rayon réglable), *Placer* un lieu. Un marqueur est *caché*,
  *rumeur* (zone approximative) ou *connu*. *Voir comme le joueur* montre le mode Jeu.

## 6. Mises à jour

Quand une nouvelle version est publiée, Réglages affiche *Mettre à jour*. Rien n'est imposé en pleine
partie : appliquez la mise à jour entre deux sessions.

## 7. Sauvegardes

- **Réglages → Exporter la campagne** : un fichier `.zip` (données + images + sons). Rangez-le
  ailleurs que sur la tablette (PC, clé USB, Drive). Un point orange sur *Réglages* rappelle d'exporter
  quand la dernière sauvegarde date de plus de 3 jours.
- **Restaurer** (mode Préparation) : le fichier est entièrement vérifié avant toute écriture, puis la
  campagne est remplacée en une seule opération (tout ou rien).
- Les sauvegardes des versions précédentes restent lisibles par les versions suivantes.

## 8. En cas de souci

| Symptôme | Que faire |
|---|---|
| Pas de son | Toucher *Activer l'ambiance sonore* ; vérifier *Couper le son* et les volumes ; fichier illisible signalé ? le convertir en MP3/OGG |
| Un écran affiche « Cet écran a rencontré un problème » | *Revenir à l'Exploration* ou *Recharger* : les données ne sont pas touchées |
| « Stockage persistant : non accordé » | Installer l'application sur l'écran d'accueil, puis *Demander* dans Réglages |
| L'écran se met en veille | Réglages → *Garder l'écran allumé* |
| Animations gênantes | Réglages → *Effets d'ambiance* ; ou réglage Android « réduire les animations » |
