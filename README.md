# Anka

Application de rencontre à 4 écrans principaux : Accueil (suggestions), Forum, Défis, Profil — plus un espace Superviseur pour la modération.

## Structure

```
anka-maquette/
├── index.html      # structure de la page (gates auth/onboarding, app, superviseur)
├── css/
│   └── style.css   # palette, typographie, composants
└── js/
    ├── auth.js         # connexion, inscription, bascule de mode
    ├── app.js           # navigation entre les onglets
    ├── accueil.js, forum.js, defis.js, profil.js, profile-view.js
    ├── onboarding.js, session-switch.js
    ├── profile.js, posts.js, friends.js, reports.js
    ├── supervisor.js   # back-office de modération
    └── supabase-client.js
```

## Ouvrir le projet

1. Ouvre le dossier `anka-maquette` dans VS Code (`Fichier > Ouvrir le dossier...`).
2. Installe l'extension **Live Server** si tu ne l'as pas déjà.
3. Clic droit sur `index.html` → **Open with Live Server**.

L'app se connecte à un projet Supabase réel (voir `js/supabase-client.js`) : les fonctionnalités (auth, profils, mur, forum, défis, modération) nécessitent une connexion réseau vers ce backend.

## Pour aller plus loin

- Les couleurs, polices et espacements sont centralisés en variables CSS en haut de `style.css` (`:root`) — facile à ajuster globalement.
- Le contenu de chaque écran (`accueil`, `forum`, `defis`, `profil`) est rendu par le module JS correspondant ; `app.js` gère la navigation et l'en-tête par écran.
