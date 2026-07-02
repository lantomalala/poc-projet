# 🚀 Goofy Newton - Interface Web

Une interface web moderne pour contrôler et monitorer votre crawler en temps réel.

## 🎯 Fonctionnalités

- **Champ d'entrée URL** - Entrez l'URL que vous voulez crawler
- **Bouton Démarrer** - Lance le crawler sur l'URL spécifiée
- **Bouton Arrêter** - Arrête le crawler en cours d'exécution
- **Bouton Télécharger** - Télécharge le crawl au format .warc
- **Bouton Effacer** - Efface le journal d'activité
- **Journal d'activité** - Affiche en temps réel tous les logs du crawler
- **Statut** - Affiche l'état actuel du crawler (Inactif, En cours, Terminé)
- **Compteur de logs** - Nombre de lignes de logs affichées

## 🚀 Démarrage

### Option 1: Utiliser l'interface web (recommandé)

```bash
npm run ui
```

Puis ouvrez votre navigateur sur:
```
http://localhost:3000
```

### Option 2: Démarrer le crawler classiquement

```bash
npm start
```

## 📋 Utilisation

1. **Entrer une URL** dans le champ "Entrez l'URL à crawler"
2. **Cliquer sur "Démarrer"** pour lancer le crawler
3. **Observer les logs** qui s'affichent en temps réel
4. **Auto-scroll** pour suivre les derniers logs (bouton 📌)
5. **Arrêter** pour interrompre le crawler si nécessaire
6. **Télécharger** le crawl quand c'est fini

## ⚙️ Configuration

Modifiez `src/config.js` pour ajuster:

- `START_URL` - URL de départ
- `TARGET_DOMAIN` - Domaine cible
- `CONCURRENCY` - Nombre de requêtes parallèles
- `MAX_PAGES` - Nombre maximum de pages
- `MAX_DEPTH` - Profondeur maximale du crawl
- `REQUEST_TIMEOUT` - Timeout des requêtes

## 📊 Couleurs des logs

- 🔵 **INFO** - Informations générales
- 🟢 **VISIT** - Pages visitées
- 🟠 **SAVED** - Pages sauvegardées
- 🟣 **WORK** - Checkpoint du travail
- 🟡 **CORE** - Requêtes axios
- 🔴 **BLACKLIST** - URLs blacklistées

## 🎨 Interface

L'interface offre:
- Design moderne avec gradient
- Responsive (mobile, tablet, desktop)
- Logs avec coloration syntaxique
- Auto-scroll activé par défaut
- Statut en temps réel

## 💾 Données

- Les crawls sont sauvegardés dans le dossier `crawl/`
- Les logs sont dans `crawl.log`
- L'état de travail est dans `crawl.work`
- Format d'archive: `crawl.warc`

## 🔧 Développement

### Structure des fichiers

```
src/
├── index.js            # Entry point classique
├── ui.js               # Serveur Express pour l'interface
├── crawlServer.js      # Crawler avec URL personnalisée
├── crawler.js          # Logique du crawler
├── config.js           # Configuration
└── ...

public/
├── index.html          # Interface web
├── styles.css          # Styles
└── app.js              # Logique front-end
```

## 📝 Notes

- Le crawler peut être arrêté et repris depuis le même point
- Les URLs blacklistées (HTTP 429/503) sont automatiquement retriées
- La politesse est respectée (délai entre les requêtes)
- Les logs sont conservés pendant la session

## 🐛 Troubleshooting

**Port déjà en utilisation?**
```bash
# Modifier le PORT dans src/ui.js
```

**Logs vides?**
- Vérifiez que l'URL est valide
- Consultez la console du serveur pour les erreurs

**Crawler se ferme rapidement?**
- Vérifiez la configuration des timeouts
- Vérifiez l'URL cible
