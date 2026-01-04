// Background service worker
let activeTabId = null;
let offscreenDocumentCreated = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_CAPTURE') {
    startCapture(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.type === 'STOP_CAPTURE') {
    stopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Forward transcription results from offscreen to content script
  if (message.type === 'TRANSCRIPTION_RESULT' && activeTabId) {
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_SUBTITLE',
      text: message.text,
      isInterim: message.isInterim
    }).catch(() => {});
  }

  if (message.type === 'TRANSCRIPTION_ERROR') {
    console.error('Transcription error:', message.error);
  }
});

async function startCapture(settings) {
  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  activeTabId = tab.id;

  // Initialize content script
  await chrome.tabs.sendMessage(activeTabId, {
    type: 'INIT_SUBTITLES',
    settings
  }).catch(() => {});

  // Create offscreen document for speech recognition
  await ensureOffscreenDocument();

  // Start tab capture
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: activeTabId
  });

  // Send stream ID to offscreen document
  chrome.runtime.sendMessage({
    type: 'START_RECOGNITION',
    streamId,
    settings
  });
}

async function stopCapture() {
  // Stop recognition in offscreen document
  chrome.runtime.sendMessage({ type: 'STOP_RECOGNITION' });

  // Hide subtitles
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: 'STOP_SUBTITLES' }).catch(() => {});
  }

  activeTabId = null;
}

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) return;

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    offscreenDocumentCreated = true;
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Speech recognition requires audio access'
  });

  offscreenDocumentCreated = true;
}

// Clean up on extension unload
chrome.runtime.onSuspend?.addListener(() => {
  stopCapture();
});
