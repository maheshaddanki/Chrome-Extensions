// Background service worker
let activeTabId = null;
let offscreenDocumentCreated = false;

// Listen for messages from popup and offscreen
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  if (message.type === 'START_CAPTURE') {
    startCapture(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('Start capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
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
    console.log('Forwarding transcription to tab:', activeTabId, message.text);
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_SUBTITLE',
      text: message.text,
      isInterim: message.isInterim
    }).catch((err) => console.error('Failed to send to tab:', err));
  }

  if (message.type === 'TRANSCRIPTION_ERROR') {
    console.error('Transcription error:', message.error);
    // Notify content script to show error
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SHOW_SUBTITLE',
        text: 'Error: ' + message.error,
        isInterim: false
      }).catch(() => {});
    }
  }

  if (message.type === 'RECOGNITION_STARTED') {
    console.log('Recognition started successfully');
  }
});

async function startCapture(settings) {
  console.log('Starting capture with settings:', settings);

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  console.log('Active tab:', tab.id, tab.url);
  activeTabId = tab.id;

  // Initialize content script
  try {
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'INIT_SUBTITLES',
      settings
    });
    console.log('Content script initialized');
  } catch (e) {
    console.log('Content script may not be ready, injecting...');
    // Content script might not be loaded yet, that's ok
  }

  // Create offscreen document for speech recognition
  await ensureOffscreenDocument();
  console.log('Offscreen document ready');

  // Start tab capture
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: activeTabId
  });
  console.log('Got stream ID:', streamId);

  // Small delay to ensure offscreen document is ready
  await new Promise(resolve => setTimeout(resolve, 100));

  // Send stream ID to offscreen document
  chrome.runtime.sendMessage({
    type: 'START_RECOGNITION',
    streamId,
    settings
  });

  console.log('Sent START_RECOGNITION to offscreen');
}

async function stopCapture() {
  console.log('Stopping capture...');

  // Stop recognition in offscreen document
  chrome.runtime.sendMessage({ type: 'STOP_RECOGNITION' });

  // Hide subtitles
  if (activeTabId) {
    chrome.tabs.sendMessage(activeTabId, { type: 'STOP_SUBTITLES' }).catch(() => {});
  }

  activeTabId = null;
}

async function ensureOffscreenDocument() {
  if (offscreenDocumentCreated) {
    console.log('Offscreen document already exists');
    return;
  }

  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    console.log('Found existing offscreen document');
    offscreenDocumentCreated = true;
    return;
  }

  console.log('Creating new offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Speech recognition requires audio access from tab'
  });

  offscreenDocumentCreated = true;
  console.log('Offscreen document created');
}

// Clean up on extension unload
chrome.runtime.onSuspend?.addListener(() => {
  stopCapture();
});
