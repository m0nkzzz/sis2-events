# SiS2 Events

Plateforme d'inscription thématisée pour les soirées et événements SiS2.
Les collègues ouvrent un lien, sans compte ni connexion, et vivent une petite expérience à thème. Les réponses arrivent dans un Google Sheet, tu reçois un mail à chaque réponse et tu suis tout dans un dashboard privé.

| Quoi | Lien |
|---|---|
| Formulaire (à partager) | https://m0nkzzz.github.io/sis2-events/events/soiree-game-guilde/ |
| Dashboard (toi seul, clé admin) | https://m0nkzzz.github.io/sis2-events/events/soiree-game-guilde/admin.html |
| Tester le formulaire sans rien envoyer | ajouter `?apercu` à l'URL du formulaire |
| Voir le dashboard avec de fausses données | ajouter `?demo` à l'URL du dashboard |

---

## Comment c'est construit

```
sis2-events/
├── index.html                  → redirige vers l'événement en cours (1 ligne à changer)
├── backend/Code.gs             → le backend Google Apps Script (à coller dans Google)
├── core/                       → le moteur commun, tu n'as normalement pas à y toucher
│   ├── platform.js / .css      → questions, conditions, brouillon, envoi, musique
│   └── admin.js / .css         → le dashboard (stats, liste, export…)
├── themes/
│   └── parchemin/              → un thème = une mise en scène réutilisable
│       ├── form.css / form.js  → accueil, animations, envoi, confirmation
│       ├── music.js            → musique générée en direct (pas de fichier)
│       └── admin.css           → habillage du dashboard
└── events/
    └── soiree-game-guilde/     → un dossier par événement
        ├── config.js           → ⭐ textes, questions, réglages : LE fichier à modifier
        ├── index.html          → le formulaire (charge le thème)
        ├── admin.html          → le dashboard
        └── preview.png         → image d'aperçu quand on colle le lien (Teams, Outlook…)
```

**Ce qui est public :** le code (le dépôt GitHub est public, c'est obligatoire pour GitHub Pages gratuit).
**Ce qui reste privé :** les réponses (dans ton Google Sheet) et la clé admin (dans les propriétés du script Google). Sans la clé, le dashboard ne montre rien.

---

## Installation du backend Google (une seule fois)

1. Va sur [sheets.new](https://sheets.new) et nomme le fichier **SiS2 Events — Réponses**.
2. Menu **Extensions → Apps Script**. Supprime le contenu de `Code.gs`, colle tout le fichier [`backend/Code.gs`](backend/Code.gs), puis clique sur 💾.
3. Dans la liste des fonctions en haut, choisis **`setup`** et clique sur **Exécuter**. Google demande des autorisations : *Examiner les autorisations* → ton compte → *Paramètres avancés* → *Accéder au projet (non sécurisé)* → *Autoriser*. C'est normal, c'est ton propre script.
4. Le **journal d'exécution** affiche ta **clé admin**. Garde-la, c'est le mot de passe du dashboard.
5. Clique sur ⚙️ **Paramètres du projet**, puis descends jusqu'à **Propriétés du script** et règle :
   - `NOTIFY_EMAIL` → l'adresse qui reçoit les notifications ;
   - `SITE_URL` → `https://m0nkzzz.github.io/sis2-events`, pour le lien « Ouvrir le dashboard » dans les mails.
6. Retourne dans l'éditeur, choisis **`testNotification`** et clique sur **Exécuter**. Un mail de test doit arriver. S'il n'arrive pas, regarde dans les spams.
7. Clique sur **Déployer → Nouveau déploiement** → ⚙️ **Application Web** :
   - *Exécuter en tant que* : **Moi** ;
   - *Qui peut accéder* : **Tout le monde**.
   Clique sur **Déployer** et copie l'**URL de l'application Web** (elle se termine par `/exec`).
8. Colle cette URL dans `events/<événement>/config.js` → `endpoint: '…'`. Tant que `endpoint` est vide, le formulaire reste en mode aperçu.

> **Si tu modifies `Code.gs` plus tard :** va dans **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer**. L'URL ne change pas.
> **Clé admin compromise :** exécute `resetAdminKey`, puis reconnecte-toi au dashboard avec la nouvelle clé.

## Mise en ligne (GitHub Pages)

Dans le dépôt GitHub : **Settings → Pages → Source : Deploy from a branch → `main` / `/ (root)` → Save**.
Après environ une minute, le site est en ligne sur `https://m0nkzzz.github.io/sis2-events/`. Chaque `git push` le met à jour.

---

## Créer un nouvel événement

**Le plus simple :** demande à Claude, par exemple : *« Nouvel événement SiS2 : soirée karaoké années 80, le 12 décembre, questions : … »*. Il crée le dossier, le thème et pousse le tout.

**À la main**, pour un événement qui réutilise un thème existant :

1. Copie le dossier `events/soiree-game-guilde` sous un nouveau nom, en minuscules avec des tirets, par ex. `events/raclette-2027`.
2. Dans `config.js`, change `slug` (même nom que le dossier), `title`, les `texts` et les `questions`. Le `endpoint` reste le même pour tous les événements : chaque événement a son propre onglet dans le Google Sheet.
3. Dans `index.html` et `admin.html`, mets à jour le `<title>` et les balises `og:` (aperçu du lien).
4. Dans `/index.html` à la racine, fais pointer la redirection vers le nouveau dossier.
5. `git add . && git commit -m "Nouvel événement" && git push`

Les anciens événements restent en ligne et gardent leurs réponses. Pour fermer un formulaire, renseigne `deadline: '2026-12-10T23:59'`.

### Référence des questions (`config.js`)

| Champ | Effet |
|---|---|
| `id` | identifiant unique (lettres, chiffres, `_`, `-`) : c'est le nom de la colonne dans le Sheet |
| `type` | `multi` (plusieurs choix) · `choice` (un seul) · `select` · `text` · `textarea` · `number` · `email` · `signature` |
| `label`, `hint`, `icon`, `placeholder` | textes affichés |
| `required: true` | réponse obligatoire ; `errorMessage` pour personnaliser l'erreur |
| `options` | `['A', 'B']` ou `[{ value, label, icon, hint }]` |
| `other: { label, placeholder }` | ajoute une option « Autre » avec un champ libre |
| `layout: 'compact'` | options en petites cases |
| `minSelect`, `maxSelect` | limites pour `multi` |
| `min`, `max` | limites pour `number` |
| `role: 'name'` | ce champ sert de nom du répondant (mail, dashboard, doublons) |
| `showIf: { id: 'presence', in: ['Oui'] }` | n'affiche la question que selon une autre réponse (`equals`, `in`, `notIn`, `filled`) |
| `short` | titre court de la colonne dans le dashboard |
| `adminHidden: true` | ne pas afficher dans le dashboard |

`admin.highlights` choisit les cartes « en tête » affichées en haut du dashboard.

## Créer un nouveau thème

Un thème, c'est un dossier `themes/<nom>/` qui contient au minimum :

- `form.js` : construit toute la page (accueil, lettre, animation, confirmation) en s'appuyant sur `window.Platform` ;
- `form.css` : le style du formulaire ;
- `admin.css` : il redéfinit les variables `--a-*` du dashboard (couleurs, polices, rayons).

L'API `Platform`, exposée par `core/platform.js` :

| Fonction | Rôle |
|---|---|
| `mount(form)` | génère les questions de `config.js` dans un `<form>` |
| `validate()` | affiche les erreurs, renvoie `{ ok, errors }` |
| `collect()` | renvoie les réponses prêtes à envoyer |
| `submit(answers)` | envoie au backend (ou simule en mode aperçu), renvoie `{ ok, id, count }` |
| `summary(answers)` | renvoie `[{ label, icon, value }]` pour l'écran de confirmation |
| `count()` | nombre de réponses déjà reçues |
| `music.start()`, `music.setGenerator()`, `musicButton()` | musique de fond |
| `text(key, fallback)` | lit `config.texts` |
| `previous()`, `hasDraft()`, `reset()` | réponse déjà envoyée, brouillon, remise à zéro |

Classes générées pour les questions : `.q`, `.q--<type>`, `.q__label`, `.q__hint`, `.q__options`, `.opt`, `.opt__mark`, `.opt__label`, `.q__input`, `.q__error`, `.q--invalid`.

## Bon à savoir

- **Doublons** : si quelqu'un répond deux fois avec le même nom, le dashboard ne compte que sa réponse la plus récente. Tu peux décocher l'option pour tout voir.
- **Brouillon** : ce qu'un collègue a commencé à remplir est gardé dans son navigateur s'il ferme l'onglet.
- **Mails** : Gmail autorise environ 100 notifications par jour, largement assez pour une soirée.
- **Musique** : elle ne démarre qu'après un premier clic (règle des navigateurs). Le bouton ♫ en haut à droite la coupe.
- **Accessibilité** : tout se fait au clavier, et les animations sont raccourcies si l'appareil demande moins de mouvements.
