/**
 * proxyManager.js
 *
 * Gère le pool de proxies rotatifs.
 *
 * Stratégie :
 *  - Chaque requête utilise le proxy courant.
 *  - Dès qu'un blacklistage est détecté, on passe automatiquement au proxy suivant.
 *  - La rotation est circulaire : quand on atteint la fin de la liste, on repart du début.
 *  - Un log est émis à chaque rotation pour faciliter le suivi.
 */

'use strict';

const logger = require('./logger');

// ---------------------------------------------------------------------------
// Liste brute des proxies  (format : ip:port:user:password)
// ---------------------------------------------------------------------------

const RAW_PROXIES = [
  '138.226.88.7:7695:taapitnew:gestiontapit75taapitnew',
  '138.226.65.218:7409:taapitnew:gestiontapit75taapitnew',
  '9.142.194.15:6683:taapitnew:gestiontapit75taapitnew',
  '45.56.179.161:9365:taapitnew:gestiontapit75taapitnew',
  '130.180.234.173:7396:taapitnew:gestiontapit75taapitnew',
  '9.142.214.142:6807:taapitnew:gestiontapit75taapitnew',
  '9.142.11.81:5237:taapitnew:gestiontapit75taapitnew',
  '192.53.142.135:5832:taapitnew:gestiontapit75taapitnew',
  '130.180.235.23:5743:taapitnew:gestiontapit75taapitnew',
  '130.180.237.6:6949:taapitnew:gestiontapit75taapitnew',
  '45.56.179.156:9360:taapitnew:gestiontapit75taapitnew',
  '138.226.70.205:7895:taapitnew:gestiontapit75taapitnew',
  '9.142.14.110:6766:taapitnew:gestiontapit75taapitnew',
  '103.130.178.13:5677:taapitnew:gestiontapit75taapitnew',
  '72.1.145.132:5525:taapitnew:gestiontapit75taapitnew',
  '63.246.137.9:5638:taapitnew:gestiontapit75taapitnew',
  '216.98.249.221:7202:taapitnew:gestiontapit75taapitnew',
  '192.46.203.47:6013:taapitnew:gestiontapit75taapitnew',
  '9.142.41.5:6175:taapitnew:gestiontapit75taapitnew',
  '9.142.199.180:5347:taapitnew:gestiontapit75taapitnew',
  '192.46.188.80:5739:taapitnew:gestiontapit75taapitnew',
  '130.180.237.245:7188:taapitnew:gestiontapit75taapitnew',
  '45.56.180.195:8429:taapitnew:gestiontapit75taapitnew',
  '9.142.41.17:6187:taapitnew:gestiontapit75taapitnew',
  '9.142.214.90:6755:taapitnew:gestiontapit75taapitnew',
  '9.142.10.227:5883:taapitnew:gestiontapit75taapitnew',
  '62.164.246.182:7907:taapitnew:gestiontapit75taapitnew',
  '9.142.15.55:6211:taapitnew:gestiontapit75taapitnew',
  '9.249.22.227:6261:taapitnew:gestiontapit75taapitnew',
  '45.56.183.55:8377:taapitnew:gestiontapit75taapitnew',
  '96.62.180.204:7914:taapitnew:gestiontapit75taapitnew',
  '82.21.15.54:6814:taapitnew:gestiontapit75taapitnew',
  '82.21.44.32:7794:taapitnew:gestiontapit75taapitnew',
  '147.79.5.243:7956:taapitnew:gestiontapit75taapitnew',
  '82.21.42.51:7313:taapitnew:gestiontapit75taapitnew',
  '96.62.181.230:7442:taapitnew:gestiontapit75taapitnew',
  '150.241.248.195:7412:taapitnew:gestiontapit75taapitnew',
  '82.22.181.24:7735:taapitnew:gestiontapit75taapitnew',
  '96.62.187.19:7232:taapitnew:gestiontapit75taapitnew',
  '5.59.250.118:6816:taapitnew:gestiontapit75taapitnew',
  '82.23.88.123:7879:taapitnew:gestiontapit75taapitnew',
  '209.166.23.223:5384:taapitnew:gestiontapit75taapitnew',
  '150.241.110.35:7039:taapitnew:gestiontapit75taapitnew',
  '166.0.40.27:7035:taapitnew:gestiontapit75taapitnew',
  '150.241.117.221:5725:taapitnew:gestiontapit75taapitnew',
  '136.0.169.131:6634:taapitnew:gestiontapit75taapitnew',
  '150.241.110.41:7045:taapitnew:gestiontapit75taapitnew',
  '209.166.16.46:6707:taapitnew:gestiontapit75taapitnew',
  '209.166.23.25:5186:taapitnew:gestiontapit75taapitnew',
  '150.241.119.227:5729:taapitnew:gestiontapit75taapitnew',
  '96.62.193.236:7945:taapitnew:gestiontapit75taapitnew',
  '179.61.172.95:6646:taapitnew:gestiontapit75taapitnew',
  '179.61.172.236:6787:taapitnew:gestiontapit75taapitnew',
  '82.23.61.108:7860:taapitnew:gestiontapit75taapitnew',
  '46.203.41.38:5539:taapitnew:gestiontapit75taapitnew',
  '31.98.9.160:5338:taapitnew:gestiontapit75taapitnew',
  '46.203.82.153:6153:taapitnew:gestiontapit75taapitnew',
  '31.98.14.140:5817:taapitnew:gestiontapit75taapitnew',
  '31.98.14.220:5897:taapitnew:gestiontapit75taapitnew',
  '31.98.15.40:5217:taapitnew:gestiontapit75taapitnew',
  '82.23.61.130:7882:taapitnew:gestiontapit75taapitnew',
  '82.140.180.216:7176:taapitnew:gestiontapit75taapitnew',
  '31.98.14.105:5782:taapitnew:gestiontapit75taapitnew',
  '82.23.57.239:7493:taapitnew:gestiontapit75taapitnew',
  '46.203.82.82:6082:taapitnew:gestiontapit75taapitnew',
  '46.203.30.173:6174:taapitnew:gestiontapit75taapitnew',
  '82.23.57.225:7479:taapitnew:gestiontapit75taapitnew',
  '46.203.30.248:6249:taapitnew:gestiontapit75taapitnew',
  '31.98.14.238:5915:taapitnew:gestiontapit75taapitnew',
  '31.98.13.96:6273:taapitnew:gestiontapit75taapitnew',
  '46.203.20.70:6571:taapitnew:gestiontapit75taapitnew',
  '82.22.96.188:7896:taapitnew:gestiontapit75taapitnew',
  '82.22.96.56:7764:taapitnew:gestiontapit75taapitnew',
  '82.140.180.143:7103:taapitnew:gestiontapit75taapitnew',
  '159.148.239.190:6742:taapitnew:gestiontapit75taapitnew',
  '46.203.82.17:6017:taapitnew:gestiontapit75taapitnew',
  '31.98.8.63:5741:taapitnew:gestiontapit75taapitnew',
  '179.61.172.245:6796:taapitnew:gestiontapit75taapitnew',
  '46.203.30.114:6115:taapitnew:gestiontapit75taapitnew',
  '96.62.193.204:7913:taapitnew:gestiontapit75taapitnew',
  '104.252.62.173:5544:taapitnew:gestiontapit75taapitnew',
  '212.212.19.51:6202:taapitnew:gestiontapit75taapitnew',
  '212.212.18.17:6668:taapitnew:gestiontapit75taapitnew',
  '104.252.81.30:5901:taapitnew:gestiontapit75taapitnew',
  '212.212.18.181:6832:taapitnew:gestiontapit75taapitnew',
  '104.252.81.49:5920:taapitnew:gestiontapit75taapitnew',
  '104.252.97.140:6010:taapitnew:gestiontapit75taapitnew',
  '104.252.62.148:5519:taapitnew:gestiontapit75taapitnew',
  '87.86.25.166:5317:taapitnew:gestiontapit75taapitnew',
  '87.86.24.219:5870:taapitnew:gestiontapit75taapitnew',
  '104.252.81.135:6006:taapitnew:gestiontapit75taapitnew',
  '104.252.81.244:6115:taapitnew:gestiontapit75taapitnew',
  '87.86.24.11:5662:taapitnew:gestiontapit75taapitnew',
  '212.212.19.43:6194:taapitnew:gestiontapit75taapitnew',
  '212.212.18.218:6869:taapitnew:gestiontapit75taapitnew',
  '104.252.62.217:5588:taapitnew:gestiontapit75taapitnew',
  '104.252.81.54:5925:taapitnew:gestiontapit75taapitnew',
  '212.212.19.59:6210:taapitnew:gestiontapit75taapitnew',
  '104.252.97.247:6117:taapitnew:gestiontapit75taapitnew',
  '87.86.24.205:5856:taapitnew:gestiontapit75taapitnew',
];

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** @type {Array<{ host: string, port: number, username: string, password: string }>} */
const PROXIES = RAW_PROXIES.map((line) => {
  const [host, port, username, password] = line.trim().split(':');
  return { host, port: parseInt(port, 10), username, password };
});

if (PROXIES.length === 0) throw new Error('proxyManager: aucun proxy disponible');

// ---------------------------------------------------------------------------
// État courant
// ---------------------------------------------------------------------------

let currentIndex = 0;

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Retourne la config proxy courante au format attendu par Axios.
 *
 * @returns {{ protocol: string, host: string, port: number, auth: { username: string, password: string } }}
 */
function getProxy() {
  const p = PROXIES[currentIndex];
  return {
    protocol: 'http',
    host:     p.host,
    port:     p.port,
    auth: {
      username: p.username,
      password: p.password,
    },
  };
}

/**
 * Passe au proxy suivant dans la liste (rotation circulaire).
 *
 * @param {string} [reason]  Raison du changement, pour le log.
 */
function rotateProxy(reason = 'blacklisté') {
  const prev = PROXIES[currentIndex];
  currentIndex = (currentIndex + 1) % PROXIES.length;
  const next = PROXIES[currentIndex];
  logger.info(
    `[Proxy] Rotation (${reason}) : ${prev.host}:${prev.port} → ${next.host}:${next.port}  [${currentIndex + 1}/${PROXIES.length}]`
  );
}

/**
 * Adresse lisible du proxy actif (pour les logs).
 * @returns {string}
 */
function currentProxyLabel() {
  const p = PROXIES[currentIndex];
  return `${p.host}:${p.port}`;
}

/** Nombre total de proxies disponibles. */
function proxyCount() {
  return PROXIES.length;
}

module.exports = { getProxy, rotateProxy, currentProxyLabel, proxyCount };
