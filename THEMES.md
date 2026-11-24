# Cahier des charges des thèmes SiS2 Events

La référence, c'est le thème **Parchemin** (`themes/parchemin/`). Chaque nouveau thème doit offrir une expérience **au moins aussi complète et aussi détaillée**.

## 1. Une scène, pas une page

- L'accueil est un **lieu interactif** lié au thème (bureau du scribe, comptoir, vaisseau, salle d'arcade…). On n'y trouve pas de bouton « Commencer ».
- Pour entrer dans le formulaire, on fait **un geste qui a du sens** dans la scène : prendre une feuille puis une plume, glisser une pièce dans une borne, ouvrir un coffre…
- Tous les objets importants sont **manipulables**, avec une **physique crédible** : inertie, rotation selon le point de prise, traînée, chute, rebonds, frottement.
- Une erreur de manipulation provoque une **conséquence amusante et réversible** (avion en papier, flaque d'encre, bougie éteinte, papier qui brûle) et ne bloque jamais la suite.
- Il y a au moins **un élément vivant** qui réagit au pointeur et aux objets (flamme, fumée, néon, eau…).
- La lumière est **dynamique** et vient d'une source de la scène : elle couvre toute la page, formulaire compris, et les ombres sont portées depuis cette source.

## 2. Aucune aide par défaut

- Aucun texte d'instruction n'est affiché au départ.
- Une **flèche dessinée et une courte phrase** pointent vers le bon endroit seulement après plusieurs essais ratés ou environ 10 s d'inactivité. Elles disparaissent dès que l'étape est réussie.
- Un lien discret « Passer l'introduction » reste disponible pour l'accessibilité.

## 3. Son partout

- Une musique d'ambiance **audible**, dans le style du thème, qui démarre au premier geste.
- Un **bruitage pour chaque action** : prendre, glisser, poser, lâcher, rater, s'allumer, s'éteindre, valider, envoyer, réussir.
- Un seul bouton pour couper tout le son. Les sons sont synthétisés en Web Audio, ou proviennent de fichiers libres de droits.

## 4. Visuel « fait main », jamais « généré par IA »

- Pas d'emojis, pas de cartes arrondies génériques, pas de dégradés de bouton standards, pas d'illustrations vectorielles plates.
- Les matières sont **texturées** et les objets **dessinés en détail** (canvas procédural ou vrais assets libres) : grain, usure, irrégularités, reflets.
- Les polices sont **d'époque ou propres à l'univers**, et les mêmes du début à la fin.
- Les animations sont **réalistes** : easing physique, pas de rebonds de dessin animé gratuits.

## 5. L'envoi est une cinématique dans la scène

- La réponse **devient un objet du monde** (lettre pliée, cartouche, colis…). Elle est transformée puis emportée par un personnage ou un mécanisme du thème.
- La cinématique **attend réellement le serveur** (animation d'attente), et elle prévoit une **issue d'échec** qui rend le formulaire intact.
- Elle se termine par une **confirmation dans l'univers** (reçu, copie conforme, ticket…) qui reprend les réponses.

## 6. Partout, jusqu'au bout

- Le même niveau de détail s'applique au formulaire (cases, champs, signature, curseur, erreurs) et à la confirmation. Le dashboard reprend l'habillage du thème.
- Chaque interaction de champ a son retour visuel et sonore.

## 7. Non négociable

- Ça marche **sur mobile (tactile) et au clavier**, et ça respecte `prefers-reduced-motion`.
- On teste **chaque interaction** dans un navigateur, en captures desktop et mobile, avant de pousser. Les tests n'envoient **jamais rien au vrai backend** : on utilise `?apercu` ou le faux backend local.
- Le formulaire reste généré par `core/platform.js` : réponses, validation, brouillon et envoi ne changent pas d'un thème à l'autre.

## Architecture d'un thème (modèle Parchemin)

| Fichier | Rôle |
|---|---|
| `art.js` | textures et objets dessinés par le code |
| `desk.js` (scène) | canvas, physique, interactions, particules, lumière, aides, cinématique d'envoi |
| `audio.js` | musique et bruitages (`window.<Theme>Audio`) |
| `form.js` / `form.css` | lettre HTML accessible, signature, ouverture depuis la scène, confirmation |
| `admin.css` | variables `--a-*` du dashboard |
