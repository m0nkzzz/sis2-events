/* ============================================================
 *  CONFIG DE L'ÉVÉNEMENT — c'est le seul fichier à modifier
 *  pour changer les textes, les questions ou les réglages.
 * ============================================================ */
window.EVENT = {
  slug: 'soiree-game-guilde',          // = nom du dossier ET de l'onglet du Google Sheet (minuscules, tirets)
  title: 'Soirée Game de la Guilde',
  theme: 'parchemin',                  // dossier dans /themes
  accent: '#8b1e1e',                   // couleur du mail de notification

  // URL du backend Google (Apps Script → Déployer → URL de l'application web).
  // Vide = mode aperçu : le formulaire marche mais rien n'est envoyé.
  endpoint: 'https://script.google.com/macros/s/AKfycbwK7HMoyrPOj6qF2F6uLEX2xVXR_4e3R65By0cr3ewyjtqO0WVBmMaAVcuJ77frU9UHxA/exec',

  deadline: null,                      // ex. '2026-11-26T23:59' → formulaire fermé après
  expected: null,                      // ex. 25 → affiche « sur 25 attendu·e·s » dans le dashboard
  numbering: 'roman',                  // 'roman' | 'number' | null

  // Musique : null = musique générée par le thème. Ou un fichier : { src: 'assets/musique.mp3', volume: 0.3 }
  music: { volume: 0.7 },

  /* ---------- Textes (lus par le thème) ---------- */
  texts: {
    seal: 'SiS2',
    introKicker: 'Convocation de la Guilde',
    introTitle: 'Soirée Game de la Guilde',
    introLine: 'Une missive t’attend sur le bureau du scribe.',
    // aides fléchées qui apparaissent après quelques essais ratés
    hintStack: 'Attrape une feuille et fais-la glisser jusqu’au sous-main en cuir',
    hintBlot: 'Pose la feuille ici, au milieu du sous-main — ailleurs, elle s’envole',
    hintWell: 'Sors la plume de l’encrier et emmène-la jusqu’à ta feuille',
    hintSheet: 'Lâche la plume sur la feuille pour commencer à écrire',
    salutation: 'Oyez, gentes dames et nobles damoiseaux !',
    subtitle: 'Confiez vos désirs à notre pigeon messager afin que Messire Pablo Ramalone orchestre nos prochaines réjouissances.',
    signatureHelp: 'Apposez votre nom au bas du parchemin',
    submit: 'Sceller et confier au pigeon',
    animWait: 'Le pigeon attend que la route vers le donjon soit libre…',
    successTitle: 'Missive envolée !',
    successLine: 'Ton pigeon a pris son envol, scellé du sceau de la Guilde SiS2.',
    receiptTitle: 'Copie conforme',
    again: 'Rédiger une nouvelle missive',
    counter: 'missive(s) déjà reçue(s) par la Guilde',
    already: 'Tu as déjà envoyé une missive le {date}. Si tu as changé d’avis, rédiges-en une nouvelle : Messire Ramalone lira la plus récente.',
    closed: 'Les registres de la Guilde sont clos. Le pigeon ne prend plus de missives.',
    footer: 'Guilde SiS2 — Messire Pablo Ramalone'
  },

  /* ---------- Questions ----------
   * type : 'multi' (plusieurs choix) | 'choice' (un seul) | 'select' | 'text' | 'textarea'
   *        | 'number' | 'email' | 'signature'
   * Options utiles : required, hint, icon, layout:'compact', other:{label, placeholder},
   *   minSelect / maxSelect, role:'name' (sert de nom du répondant),
   *   showIf:{ id:'question', in:['valeur'] }, short (titre court de colonne dans le dashboard)
   */
  questions: [
    {
      id: 'dates', type: 'multi', required: true, icon: '📅',
      label: 'Vos disponibilités', short: 'Dates',
      hint: 'Sélectionnez un ou plusieurs vendredis (dès 17h00)',
      errorMessage: 'Choisissez au moins un vendredi.',
      options: [
        { value: 'Vendredi 27 novembre', label: 'Vendredi 27 novembre', hint: 'dès 17h' },
        { value: 'Vendredi 4 décembre', label: 'Vendredi 4 décembre', hint: 'dès 17h' },
        { value: 'Vendredi 11 décembre', label: 'Vendredi 11 décembre', hint: 'dès 17h' },
        { value: 'Vendredi 18 décembre', label: 'Vendredi 18 décembre', hint: 'dès 17h' }
      ]
    },
    {
      id: 'activites', type: 'multi', required: true, icon: '⚔️',
      label: 'Les joutes ludiques', short: 'Activités',
      hint: 'Choisissez une ou plusieurs activités souhaitées',
      errorMessage: 'Choisissez au moins une joute.',
      options: [
        { value: 'Loup-Garou', icon: '🐺' },
        { value: 'Jeux vidéo divers', icon: '🎮' },
        { value: 'Tournoi de ping-pong', icon: '🏓' },
        { value: 'Among Us', icon: '🚀' }
      ],
      other: { label: 'Autre', icon: '✨', placeholder: 'Précisez votre proposition ludique…' }
    },
    {
      id: 'victuailles', type: 'choice', required: true, icon: '🍗', layout: 'compact',
      label: 'Les victuailles', short: 'Repas',
      hint: 'Un seul festin par convive',
      errorMessage: 'Choisissez votre festin.',
      options: [
        { value: 'Bowl', icon: '🥗' },
        { value: 'Tacos', icon: '🌮' },
        { value: 'Pizza', icon: '🍕' },
        { value: 'Tupp', icon: '🍱', hint: 'j’apporte le mien' },
        { value: 'Kebab', icon: '🥙' }
      ]
    },
    {
      id: 'commentaires', type: 'textarea', icon: '📜',
      label: 'Autres commentaires ou propositions ?', short: 'Commentaires',
      hint: 'Allergies, boissons, jeux à apporter ou missive personnelle',
      placeholder: 'Écrivez ici vos remarques ou idées de génie…'
    },
    {
      id: 'signature', type: 'signature', role: 'name', required: true, icon: '✒️',
      label: 'Votre signature', summaryLabel: 'Signé',
      hint: 'Apposez votre prénom et nom au bas du parchemin',
      placeholder: 'Prénom Nom',
      errorMessage: 'Le parchemin doit être signé.'
    }
  ],

  /* ---------- Dashboard ---------- */
  admin: {
    emblem: '⚜',
    gateTitle: 'Registre du Maître des Cérémonies',
    highlights: [                      // cartes « en tête » en haut du dashboard
      { q: 'dates', label: '👑 Date majoritaire' },
      { q: 'activites', label: '⚔️ Joute favorite' },
      { q: 'victuailles', label: '🍗 Festin majoritaire' }
    ]
  }
};
