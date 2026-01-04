document.addEventListener('DOMContentLoaded', async () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const languageSelect = document.getElementById('languageSelect');
  const fontSizeSlider = document.getElementById('fontSizeSlider');
  const fontSizeValue = document.getElementById('fontSizeValue');
  const positionSelect = document.getElementById('positionSelect');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  // Load saved settings
  const settings = await chrome.storage.local.get(['language', 'fontSize', 'position', 'isActive']);

  if (settings.language) languageSelect.value = settings.language;
  if (settings.fontSize) {
    fontSizeSlider.value = settings.fontSize;
    fontSizeValue.textContent = settings.fontSize + 'px';
  }
  if (settings.position) positionSelect.value = settings.position;

  if (settings.isActive) {
    updateStatus(true);
  }

  // Font size slider
  fontSizeSlider.addEventListener('input', async (e) => {
    const size = e.target.value;
    fontSizeValue.textContent = size + 'px';
    await chrome.storage.local.set({ fontSize: size });
    sendToContentScript({ type: 'UPDATE_SETTINGS', fontSize: size });
  });

  // Language select
  languageSelect.addEventListener('change', async (e) => {
    const language = e.target.value;
    await chrome.storage.local.set({ language });
    sendToContentScript({ type: 'UPDATE_SETTINGS', language });
  });

  // Position select
  positionSelect.addEventListener('change', async (e) => {
    const position = e.target.value;
    await chrome.storage.local.set({ position });
    sendToContentScript({ type: 'UPDATE_SETTINGS', position });
  });

  // Start button
  startBtn.addEventListener('click', async () => {
    const settings = {
      language: languageSelect.value,
      fontSize: fontSizeSlider.value,
      position: positionSelect.value
    };

    await chrome.storage.local.set({ ...settings, isActive: true });

    // Send message to background script to start capture
    chrome.runtime.sendMessage({ type: 'START_CAPTURE', settings }, (response) => {
      if (response && response.success) {
        updateStatus(true);
      } else {
        updateStatus(false, response?.error || 'Failed to start');
      }
    });
  });

  // Stop button
  stopBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isActive: false });

    chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' }, () => {
      updateStatus(false);
    });
  });

  function updateStatus(active, error = null) {
    if (error) {
      statusIndicator.className = 'status-indicator error';
      statusText.textContent = error;
      startBtn.disabled = false;
      stopBtn.disabled = true;
    } else if (active) {
      statusIndicator.className = 'status-indicator active';
      statusText.textContent = 'Listening...';
      startBtn.disabled = true;
      stopBtn.disabled = false;
    } else {
      statusIndicator.className = 'status-indicator';
      statusText.textContent = 'Ready';
      startBtn.disabled = false;
      stopBtn.disabled = true;
    }
  }

  async function sendToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }
});
