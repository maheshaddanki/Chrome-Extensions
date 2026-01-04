// Content script for subtitle display only
let subtitleContainer = null;
let subtitleText = null;
let hideTimeout = null;

let settings = {
  fontSize: 24,
  position: 'bottom'
};

console.log('Realtime Subtitles: Content script loaded');

// Initialize subtitle container
function initSubtitleContainer() {
  if (subtitleContainer) return;

  console.log('Creating subtitle container');

  subtitleContainer = document.createElement('div');
  subtitleContainer.id = 'realtime-subtitle-container';
  subtitleContainer.className = settings.position + ' hidden';

  subtitleText = document.createElement('div');
  subtitleText.id = 'realtime-subtitle-text';
  subtitleText.style.fontSize = settings.fontSize + 'px';

  subtitleContainer.appendChild(subtitleText);
  document.body.appendChild(subtitleContainer);

  console.log('Subtitle container created');
}

// Show subtitle text
function showSubtitle(text, isInterim = false) {
  if (!subtitleContainer) initSubtitleContainer();

  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }

  if (text && text.trim()) {
    subtitleText.textContent = text;
    subtitleText.className = isInterim ? 'interim' : '';
    subtitleContainer.classList.remove('hidden');

    // Auto-hide after 5 seconds for final results
    if (!isInterim) {
      hideTimeout = setTimeout(() => {
        subtitleContainer.classList.add('hidden');
      }, 5000);
    }
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
      const isHidden = subtitleContainer.classList.contains('hidden');
      subtitleContainer.className = newSettings.position + (isHidden ? ' hidden' : '');
    }
  }
}

// Remove subtitle container
function removeSubtitleContainer() {
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

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content received:', message.type);

  switch (message.type) {
    case 'SHOW_SUBTITLE':
      showSubtitle(message.text, message.isInterim);
      sendResponse({ success: true });
      break;

    case 'HIDE_SUBTITLE':
      if (subtitleContainer) subtitleContainer.classList.add('hidden');
      sendResponse({ success: true });
      break;

    case 'UPDATE_SETTINGS':
      updateSettings(message);
      sendResponse({ success: true });
      break;

    case 'INIT_SUBTITLES':
      initSubtitleContainer();
      if (message.settings) updateSettings(message.settings);
      sendResponse({ success: true });
      break;

    case 'STOP_SUBTITLES':
      removeSubtitleContainer();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false });
  }

  return true;
});
