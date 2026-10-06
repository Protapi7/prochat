const browserAPI = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

const DEFAULT_SERVER = 'http://localhost:3001';

function normalizeUrl(url) {
  if (!url) return DEFAULT_SERVER;
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'http://' + trimmed;
  }
  return trimmed;
}

function getStoredServerUrl(callback) {
  try {
    if (browserAPI && browserAPI.storage && browserAPI.storage.sync) {
      browserAPI.storage.sync.get(['prochat_server_url'], (result) => {
        if (result && result.prochat_server_url) {
          callback(normalizeUrl(result.prochat_server_url));
        } else if (browserAPI.storage.local) {
          browserAPI.storage.local.get(['prochat_server_url'], (localRes) => {
            callback(normalizeUrl(localRes && localRes.prochat_server_url));
          });
        } else {
          callback(getFromLocalStorage());
        }
      });
    } else {
      callback(getFromLocalStorage());
    }
  } catch (e) {
    callback(getFromLocalStorage());
  }
}

function getFromLocalStorage() {
  try {
    const val = localStorage.getItem('prochat_server_url');
    return normalizeUrl(val);
  } catch (e) {
    return DEFAULT_SERVER;
  }
}

function saveServerUrl(url, callback) {
  const formatted = normalizeUrl(url);
  try {
    if (browserAPI && browserAPI.storage && browserAPI.storage.sync) {
      browserAPI.storage.sync.set({ prochat_server_url: formatted }, () => {
        if (callback) callback(formatted);
      });
    } else if (browserAPI && browserAPI.storage && browserAPI.storage.local) {
      browserAPI.storage.local.set({ prochat_server_url: formatted }, () => {
        if (callback) callback(formatted);
      });
    } else {
      localStorage.setItem('prochat_server_url', formatted);
      if (callback) callback(formatted);
    }
  } catch (e) {
    try { localStorage.setItem('prochat_server_url', formatted); } catch (err) {}
    if (callback) callback(formatted);
  }
}

function openTab(path) {
  getStoredServerUrl((serverUrl) => {
    const fullUrl = path ? `${serverUrl}${path}` : serverUrl;
    if (browserAPI && browserAPI.tabs && browserAPI.tabs.create) {
      browserAPI.tabs.create({ url: fullUrl });
    } else {
      window.open(fullUrl, '_blank');
    }
  });
}

function checkServerHealth(serverUrl) {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const pingResult = document.getElementById('pingResult');

  if (statusDot) statusDot.className = 'status-dot checking';
  if (statusText) statusText.textContent = 'Checking...';
  if (pingResult) {
    pingResult.textContent = 'Testing...';
    pingResult.className = 'ping-result';
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  fetch(`${serverUrl}/api/health`, { signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      if (res.ok) {
        const duration = Date.now() - startTime;
        if (statusDot) statusDot.className = 'status-dot online';
        if (statusText) statusText.textContent = 'Connected';
        if (pingResult) {
          pingResult.textContent = `✓ Online (${duration}ms)`;
          pingResult.className = 'ping-result success';
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (statusDot) statusDot.className = 'status-dot offline';
      if (statusText) statusText.textContent = 'Offline';
      if (pingResult) {
        pingResult.textContent = '❌ Unreachable';
        pingResult.className = 'ping-result error';
      }
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const serverInput = document.getElementById('serverUrlInput');
  const saveBtn = document.getElementById('saveServerBtn');
  const testBtn = document.getElementById('testPingBtn');
  const openAppBtn = document.getElementById('openAppBtn');
  const geminiBtn = document.getElementById('geminiBtn');

  getStoredServerUrl((url) => {
    if (serverInput) serverInput.value = url;
    checkServerHealth(url);
  });

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = serverInput.value;
      saveServerUrl(val, (savedUrl) => {
        if (serverInput) serverInput.value = savedUrl;
        checkServerHealth(savedUrl);
      });
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      const val = serverInput ? serverInput.value : DEFAULT_SERVER;
      checkServerHealth(normalizeUrl(val));
    });
  }

  if (openAppBtn) {
    openAppBtn.addEventListener('click', () => openTab(''));
  }

  if (geminiBtn) {
    geminiBtn.addEventListener('click', () => openTab('/?activeChat=Gemini%20AI'));
  }
});

