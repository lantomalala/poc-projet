/**
 * app.js
 * UI for the Goofy Newton Crawler
 */

const DOM = {
  urlInput: document.getElementById('urlInput'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  clearBtn: document.getElementById('clearBtn'),
  autoScrollBtn: document.getElementById('autoScrollBtn'),
  logContainer: document.getElementById('logContainer'),
  statusIndicator: document.getElementById('statusIndicator'),
  logCount: document.getElementById('logCount'),
};

let state = {
  isRunning: false,
  autoScroll: true,
  logLines: 0,
  eventSource: null,
};

/**
 * Initialize the application
 */
function init() {
  DOM.startBtn.addEventListener('click', startCrawl);
  DOM.stopBtn.addEventListener('click', stopCrawl);
  DOM.downloadBtn.addEventListener('click', downloadCrawl);
  DOM.clearBtn.addEventListener('click', clearLog);
  DOM.autoScrollBtn.addEventListener('click', toggleAutoScroll);

  // Allow starting with Enter key
  DOM.urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !state.isRunning) {
      startCrawl();
    }
  });

  checkStatus();
}

/**
 * Check crawler status
 */
async function checkStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    if (data.running) {
      connectToLogs();
      setRunning(true);
    } else {
      setRunning(false);
    }
  } catch (err) {
    console.error('Failed to check status:', err);
  }
}

/**
 * Start the crawl
 */
async function startCrawl() {
  const url = DOM.urlInput.value.trim();

  if (!url) {
    alert('Please enter a URL');
    return;
  }

  try {
    const res = await fetch('/api/start-crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`Error: ${err.error}`);
      return;
    }

    clearLogUI();
    setRunning(true);
    connectToLogs();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

/**
 * Stop the crawl
 */
async function stopCrawl() {
  try {
    const res = await fetch('/api/stop-crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`Error: ${err.error}`);
      return;
    }

    setRunning(false);
    disconnectLogs();
    updateStatus('Stopped', 'status-idle');
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

/**
 * Download the crawl
 */
async function downloadCrawl() {
  try {
    const res = await fetch('/api/download-crawl');
    if (!res.ok) {
      alert('Error: crawl not available');
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'crawl.warc';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

/**
 * Clear the log UI
 */
function clearLog() {
  if (confirm('Clear the log?')) {
    clearLogUI();
  }
}

function clearLogUI() {
  DOM.logContainer.innerHTML = '';
  state.logLines = 0;
  updateLogCount();
}

/**
 * Toggle auto-scroll
 */
function toggleAutoScroll() {
  state.autoScroll = !state.autoScroll;
  DOM.autoScrollBtn.classList.toggle('active', state.autoScroll);
}

/**
 * Connect to Server-Sent Events log stream
 */
function connectToLogs() {
  disconnectLogs();

  state.eventSource = new EventSource('/api/logs');

  state.eventSource.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.status) {
        // Status message
        const statusText = data.status === 'completed' ? 'Completed' : 'Running';
        const statusClass = data.status === 'completed' ? 'status-completed' : 'status-running';
        updateStatus(statusText, statusClass);

        if (data.status === 'completed') {
          setRunning(false);
          disconnectLogs();
        }
      } else if (data.line) {
        // Log message
        addLogEntry(data.line);
      }
    } catch (err) {
      console.error('Failed to parse event:', err);
    }
  });

  state.eventSource.addEventListener('error', () => {
    console.error('EventSource error');
    disconnectLogs();
  });

  updateStatus('Running', 'status-running');
}

/**
 * Disconnect from log stream
 */
function disconnectLogs() {
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
}

/**
 * Add a log entry to the UI
 */
function addLogEntry(line) {
  // Create container if empty
  if (DOM.logContainer.innerHTML === '' || DOM.logContainer.querySelector('.log-placeholder')) {
    DOM.logContainer.innerHTML = '';
  }

  const entry = document.createElement('div');
  entry.className = 'log-entry ' + getLogClass(line);
  entry.textContent = line;

  DOM.logContainer.appendChild(entry);
  state.logLines++;
  updateLogCount();

  if (state.autoScroll) {
    DOM.logContainer.scrollTop = DOM.logContainer.scrollHeight;
  }
}

/**
 * Determine log entry class based on content
 */
function getLogClass(line) {
  if (line.includes('INFO')) return 'info';
  if (line.includes('VISIT')) return 'visit';
  if (line.includes('SAVED')) return 'saved';
  if (line.includes('WORK')) return 'work';
  if (line.includes('ERROR')) return 'error';
  if (line.includes('BLACKLIST')) return 'blacklist';
  if (line.includes('core')) return 'core';
  return '';
}

/**
 * Update running state
 */
function setRunning(running) {
  state.isRunning = running;
  DOM.startBtn.disabled = running;
  DOM.stopBtn.disabled = !running;
  DOM.urlInput.disabled = running;

  if (running) {
    updateStatus('Running', 'status-running');
  }
}

/**
 * Update status display
 */
function updateStatus(text, className) {
  DOM.statusIndicator.textContent = text;
  DOM.statusIndicator.className = 'status-value ' + className;
}

/**
 * Update log counter
 */
function updateLogCount() {
  DOM.logCount.textContent = state.logLines;
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
