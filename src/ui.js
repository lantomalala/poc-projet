const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let crawlProcess = null;
let logContent = '';
const clients = [];

// Charger le log existant
function loadExistingLog() {
  const logPath = path.join(__dirname, '../crawl.log');
  if (fs.existsSync(logPath)) {
    try {
      logContent = fs.readFileSync(logPath, 'utf-8');
    } catch (err) {
      console.warn('Could not read existing log:', err.message);
    }
  }
}

// Logger console avec couleur
function logToConsole(type, message) {
  const colors = {
    INFO: '\x1b[36m',     // Cyan
    VISIT: '\x1b[32m',    // Green
    SAVED: '\x1b[33m',    // Yellow
    WORK: '\x1b[35m',     // Magenta
    CORE: '\x1b[33m',     // Yellow
    BLACKLIST: '\x1b[31m', // Red
    ERROR: '\x1b[31m',    // Red
    RESET: '\x1b[0m'
  };
  
  const color = colors[type] || colors.RESET;
  console.log(`${color}[${new Date().toLocaleTimeString()}] ${message}${colors.RESET}`);
}

// Lancer le crawler
app.post('/api/start-crawl', (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (crawlProcess) {
    return res.status(400).json({ error: 'Crawl already in progress' });
  }

  // Réinitialiser le log
  logContent = '';
  console.clear();
  logToConsole('INFO', `🚀 Starting crawl from: ${url}`);

  // Lancer le processus du crawler
  crawlProcess = spawn('node', [path.join(__dirname, 'crawlServer.js')], {
    env: { ...process.env, CRAWL_URL: url },
    cwd: path.join(__dirname, '..')
  });

  let buffer = '';

  crawlProcess.stdout.on('data', (data) => {
    const text = data.toString();
    buffer += text;

    // Découper par lignes complètes
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Garder la dernière ligne incomplète

    lines.forEach(line => {
      if (line.trim()) {
        logContent += line + '\n';
        
        // Déterminer le type pour la console
        let logType = 'INFO';
        if (line.includes('VISIT')) logType = 'VISIT';
        else if (line.includes('SAVED')) logType = 'SAVED';
        else if (line.includes('WORK')) logType = 'WORK';
        else if (line.includes('CORE')) logType = 'CORE';
        else if (line.includes('BLACKLIST')) logType = 'BLACKLIST';
        else if (line.includes('ERROR')) logType = 'ERROR';
        
        // Afficher en console serveur
        logToConsole(logType, line);
        
        // Émettre via Server-Sent Events
        broadcastLog(line);
      }
    });
  });

  crawlProcess.stderr.on('data', (data) => {
    const text = data.toString();
    logContent += text + '\n';
    logToConsole('ERROR', text);
    broadcastLog(text);
  });

  crawlProcess.on('close', (code) => {
    logToConsole('INFO', `✓ Crawler exited with code ${code}`);
    crawlProcess = null;
    broadcastStatus('completed');
  });

  res.json({ status: 'started', url });
});

// Arrêter le crawler
app.post('/api/stop-crawl', (req, res) => {
  if (crawlProcess) {
    crawlProcess.kill();
    crawlProcess = null;
    logToConsole('INFO', '⏹ Crawler stopped');
    res.json({ status: 'stopped' });
  } else {
    res.status(400).json({ error: 'No crawl in progress' });
  }
});

// Obtenir le statut du crawler
app.get('/api/status', (req, res) => {
  res.json({
    running: crawlProcess !== null,
    logLength: logContent.length
  });
});

// Télécharger le crawl
app.get('/api/download-crawl', (req, res) => {
  const crawlPath = path.join(__dirname, '../crawl');
  if (!fs.existsSync(crawlPath)) {
    return res.status(404).json({ error: 'Crawl directory not found' });
  }

  res.download(path.join(__dirname, '../crawl.warc') || crawlPath, 'crawl.tar.gz');
});

// Server-Sent Events pour les logs
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Envoyer le log existant
  logContent.split('\n').forEach(line => {
    if (line.trim()) {
      res.write(`data: ${JSON.stringify({ line, timestamp: new Date() })}\n\n`);
    }
  });

  clients.push(res);

  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });
});

function broadcastLog(line) {
  const message = JSON.stringify({ line, timestamp: new Date() });
  clients.forEach(client => {
    client.write(`data: ${message}\n\n`);
  });
}

function broadcastStatus(status) {
  const message = JSON.stringify({ status, timestamp: new Date() });
  clients.forEach(client => {
    client.write(`data: ${message}\n\n`);
  });
}

// Charger le log existant au démarrage
loadExistingLog();

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   🚀 Goofy Newton Crawler UI           ║');
  console.log(`║   Running on http://localhost:${PORT}    ║`);
  console.log('║   Press Ctrl+C to stop                  ║');
  console.log('╚════════════════════════════════════════╝\n');
});
