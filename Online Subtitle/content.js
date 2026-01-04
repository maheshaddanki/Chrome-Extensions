// Content script for subtitle overlay
let subtitleContainer = null;
let subtitleText = null;
let hideTimeout = null;
let settings = {
  fontSize: 24,
  position: 'bottom',
  language: 'en-US'
};

console.log('Realtime Subtitles: Content script loaded');

// Initialize subtitle container
function initSubtitleContainer() {
  if (subtitleContainer) {
    console.log('Subtitle container already exists');
    return;
  }

  console.log('Creating subtitle container');

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

  console.log('Subtitle container created successfully');
}

// Show subtitle text
function showSubtitle(text, isInterim = false) {
  if (!subtitleContainer) initSubtitleContainer();

  console.log('Showing subtitle:', text, 'interim:', isInterim);

  // Clear any pending hide timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  if (text && text.trim()) {
    subtitleText.textContent = text;
    subtitleText.className = isInterim ? 'interim' : '';
    subtitleContainer.classList.remove('hidden');

    // Auto-hide after 5 seconds of no updates (for final results only)
    if (!isInterim) {
      hideTimeout = setTimeout(() => {
        hideSubtitle();
      }, 5000);
    }
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
  console.log('Updating settings:', newSettings);

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
  console.log('Removing subtitle container');
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  if (subtitleContainer) {
    subtitleContainer.remove();
    subtitleContainer = null;
    subtitleText = null;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.type);

  switch (message.type) {
    case 'SHOW_SUBTITLE':
      showSubtitle(message.text, message.isInterim);
      sendResponse({ success: true });
      break;

    case 'HIDE_SUBTITLE':
      hideSubtitle();
      sendResponse({ success: true });
      break;

    case 'UPDATE_SETTINGS':
      updateSettings(message);
      sendResponse({ success: true });
      break;

    case 'INIT_SUBTITLES':
      initSubtitleContainer();
      updateSettings(message.settings || {});
      sendResponse({ success: true });
      break;

    case 'STOP_SUBTITLES':
      removeSubtitleContainer();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true;
});

// Initialize on load
initSubtitleContainer();
