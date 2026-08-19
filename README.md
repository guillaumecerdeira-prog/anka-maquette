# Anka — Maquette d'écrans

Maquette interactive des 4 écrans principaux : Accueil (suggestions), Forum, Défis, Profil.

## Structure

```
anka-maquette/
├── index.html      # structure de la page + contenu des écrans
├── css/
│   └── style.css   # palette, typographie, composants
└── js/
    └── app.js      # navigation entre les onglets
```

## Ouvrir le projet

1. Ouvre le dossier `anka-maquette` dans VS Code (`Fichier > Ouvrir le dossier...`).
2. Installe l'extension **Live Server** si tu ne l'as pas déjà.
3. Clic droit sur `index.html` → **Open with Live Server**.

Sans extension, tu peux aussi simplement double-cliquer sur `index.html` pour l'ouvrir dans ton navigateur (la navigation entre les onglets fonctionne sans serveur).

## Pour aller plus loin

- Les couleurs, polices et espacements sont centralisés en variables CSS en haut de `style.css` (`:root`) — facile à ajuster globalement.
- Le contenu de chaque écran (`accueil`, `forum`, `defis`, `profil`) est dans l'objet `screens` de `app.js`.
