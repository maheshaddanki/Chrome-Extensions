// Content script for subtitle overlay
let subtitleContainer = null;
let subtitleText = null;
let settings = {
  fontSize: 24,
  position: 'bottom',
  language: 'en-US'
};

// Initialize subtitle container
function initSubtitleContainer() {
  if (subtitleContainer) return;

  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'realtime-subtitle-container';
  subtitleContainer.className = 'bottom hidden';

  subtitleText = document.createElement('div');
  subtitleText.id = 'realtime-subtitle-text';

  subtitleContainer.appendChild(subtitleText);
  document.body.appendChild(subtitleContainer);

  // Load settings
  chrome.storage.local.get(['fontSize', 'position'], (result) => {
    if (result.fontSize) {
      settings.fontSize = result.fontSize;
      subtitleText.style.fontSize = result.fontSize + 'px';
    }
    if (result.position) {
      settings.position = result.position;
      subtitleContainer.className = result.position + ' hidden';
    }
  });
}

// Show subtitle text
function showSubtitle(text, isInterim = false) {
  if (!subtitleContainer) initSubtitleContainer();

  if (text && text.trim()) {
    subtitleText.textContent = text;
    subtitleText.className = isInterim ? 'interim' : '';
    subtitleContainer.classList.remove('hidden');
  } else {
    hideSubtitle();
  }
}

// Hide subtitles
function hideSubtitle() {
  if (subtitleContainer) {
    subtitleContainer.classList.add('hidden');
  }
}

// Update settings
function updateSettings(newSettings) {
  if (newSettings.fontSize) {
    settings.fontSize = newSettings.fontSize;
    if (subtitleText) {
      subtitleText.style.fontSize = newSettings.fontSize + 'px';
    }
  }
  if (newSettings.position) {
    settings.position = newSettings.position;
    if (subtitleContainer) {
      subtitleContainer.className = newSettings.position + (subtitleContainer.classList.contains('hidden') ? ' hidden' : '');
    }
  }
}

// Remove subtitle container
function removeSubtitleContainer() {
  if (subtitleContainer) {
    subtitleContainer.remove();
    subtitleContainer = null;
    subtitleText = null;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SHOW_SUBTITLE':
      showSubtitle(message.text, message.isInterim);
      break;

    case 'HIDE_SUBTITLE':
      hideSubtitle();
      break;

    case 'UPDATE_SETTINGS':
      updateSettings(message);
      break;

    case 'INIT_SUBTITLES':
      initSubtitleContainer();
      updateSettings(message.settings || {});
      sendResponse({ success: true });
      break;

    case 'STOP_SUBTITLES':
      removeSubtitleContainer();
      break;
  }

  return true;
});

// Initialize on load
initSubtitleContainer();
