# 📖 Guide d'utilisation de l'interface Goofy Newton

## 🎯 Quick Start

### Pour Windows - Option 1 (Facile)
Double-cliquez sur:
```
START_UI.bat
```

### Pour Windows - Option 2 (PowerShell)
Clic droit + exécuter:
```
START_UI.ps1
```

### Pour tous les OS
```bash
npm run ui
```

Puis ouvrez votre navigateur:
```
http://localhost:3000
```

---

## 🖥️ Layout de l'interface

```
┌─────────────────────────────────────────────────────┐
│  🚀 Goofy Newton Crawler                            │
│  Interface pour contrôler votre crawler web         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  CONTRÔLE                                            │
├─────────────────────────────────────────────────────┤
│  URL:  [https://www.extra.com.br/       ] [▶ Démarrer]
│                                                      │
│  [⏹ Arrêter] [⬇ Télécharger] [🗑 Effacer log]    │
│                                                      │
│  Statut: Inactif    |    Logs: 0 lignes            │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  📋 JOURNAL D'ACTIVITÉ              [📌 Auto-scroll] │
├─────────────────────────────────────────────────────┤
│  [15:59:07] INFO Starting fresh crawl...            │
│  [15:59:10] SAVED crawl/extra.com.br/index.html     │
│  [15:59:11] VISIT [depth 1] https://...             │
│  ...                                                 │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Étapes d'utilisation

### 1️⃣ **Entrer une URL**
```
Champ texte: Entrez l'URL à crawler
Exemple: https://www.extra.com.br/
```
- Doit être une URL valide (http/https)
- Peut être un sous-domaine ou une page spécifique

### 2️⃣ **Démarrer le crawler**
```
Cliquez sur: ▶ Démarrer
```
- Le bouton "Démarrer" se désactive
- Le champ URL se verrouille
- Le statut change à "En cours..."
- Les logs commencent à s'afficher

### 3️⃣ **Observer les logs**
Le journal affiche en temps réel:
```
[HEURE] TYPE    Description
[15:59:07] INFO     Starting fresh crawl from ...
[15:59:10] VISIT    [depth 0] https://www.extra.com.br/
[15:59:10] SAVED    crawl\extra.com.br\index.html (507.5 KB)
```

**Types de logs:**
- 🔵 **INFO** - Messages informatifs
- ✔️ **VISIT** - Page visitée
- 💾 **SAVED** - Page sauvegardée
- 💼 **WORK** - Checkpoint
- 🟡 **CORE** - Requête HTTP
- 🚫 **BLACKLIST** - URL bloquée (réessai automatique)

### 4️⃣ **Contrôler le crawler**
Pendant l'exécution:
- **📌 Auto-scroll** - Active/désactive le défilement automatique
- **⏹ Arrêter** - Interrompt le crawler (peut être repris)
- **🗑 Effacer log** - Efface l'affichage (ne supprime pas les données)

### 5️⃣ **Terminer et télécharger**
Quand le crawler est fini:
- Le statut passe à "Terminé" (vert)
- Le bouton "Télécharger" est actif
- Cliquez pour télécharger le fichier `.warc`

---

## 🎨 Interprétation des couleurs

### Statut (haut à droite)
```
🟤 Inactif     - Pas de crawl en cours
🟡 En cours... - Crawl actif (clignote)
🟢 Terminé     - Crawl complété
```

### Logs
```
🔵 INFO        - Configuration et informations
✔️ VISIT       - URLs visitées
💾 SAVED       - Pages téléchargées
💼 WORK        - Sauvegarde de l'état
🟡 CORE        - Requêtes réseau
🔴 BLACKLIST   - URLs bloquées (retry)
🔴 ERROR       - Erreurs (rare)
```

---

## ⚡ Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Entrée` dans URL | Démarre le crawler |
| `Ctrl+C` en console | Arrête le serveur |

---

## 📊 Configuration avancée

Modifiez `src/config.js` pour:

```javascript
// Nombre de requêtes parallèles (5 = parfait pour politesse)
CONCURRENCY: 5,

// Limite de pages (0 = illimité)
MAX_PAGES: 500,

// Profondeur du crawl (0 = illimité)
MAX_DEPTH: 0,

// Timeout par requête
REQUEST_TIMEOUT: 20_000,

// Domaine cible (ex: extra.com.br)
TARGET_DOMAIN: 'extra.com.br',
```

---

## 🔄 Reprendre un crawl interrompu

Si vous arrêtez un crawl et le relancez:

1. Le fichier `crawl.work` conserve l'état
2. Redémarrez avec la même URL
3. Le crawler reprendra à partir du dernier checkpoint
4. Supprimez `crawl.work` pour un nouveau crawl frais:

```bash
npm run start:fresh
```

---

## 💾 Structure des fichiers générés

```
goofy-newton/
├── crawl/                 # Pages téléchargées
│   ├── extra.com.br/
│   │   ├── index.html
│   │   └── c/
│   │       ├── audio/
│   │       ├── moda/
│   │       └── ...
│   └── ...
├── crawl.log             # Tous les logs (persisté)
├── crawl.warc            # Archive Web Archive
└── crawl.work            # État du crawl (pour reprendre)
```

---

## 🐛 Troubleshooting

### "Port déjà utilisé"
```bash
# Modifier le PORT dans src/ui.js (ligne 5)
const PORT = 3000;  // Changer à 3001, 3002, etc.
```

### "Pas d'URL trouvée"
- Vérifiez que l'URL commence par `http://` ou `https://`
- Pas d'accents ou caractères spéciaux

### "Crawler ne démarre pas"
```bash
# Vérifiez que Node.js est installé
node --version

# Réinstallez les dépendances
npm install
```

### "Logs vides ou incomplets"
- Attendez quelques secondes, les premiers logs mettent du temps
- Vérifiez la console du serveur pour les erreurs
- Le site cible peut bloquer les robots

### "Téléchargement ne fonctionne pas"
- Le dossier `crawl/` doit exister et avoir du contenu
- Vérifiez que le crawl a réellement téléchargé des pages

---

## 📞 Support

Consultez:
- `UI_README.md` - Documentation technique
- `src/config.js` - Configuration complète
- `README.md` - Documentation du crawler

---

## ✨ Conseils

1. **Respecter les serveurs** - Ne baissez pas la concurrence (CONCURRENCY) trop haut
2. **Tester d'abord** - Utilisez `MAX_PAGES: 10` pour tester
3. **Monitorer** - L'interface affiche tout ce qui se passe
4. **Patience** - Un gros site peut prendre du temps
5. **Relancer** - Si un crawl échoue, relancez - il reprendra d'où il s'était arrêté

---

**Bon crawling! 🚀**
