// Background service worker for Deepgram transcription
let activeTabId = null;
let offscreenDocumentCreated = false;

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received:', message.type);

  if (message.type === 'START_CAPTURE') {
    startCapture(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error('Start capture error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.type === 'STOP_CAPTURE') {
    stopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Forward transcription results from offscreen to content script
  if (message.type === 'TRANSCRIPTION_RESULT' && activeTabId) {
    console.log('Forwarding to tab:', message.text);
    chrome.tabs.sendMessage(activeTabId, {
      type: 'SHOW_SUBTITLE',
      text: message.text,
      isInterim: message.isInterim
    }).catch((err) => console.error('Failed to send to tab:', err));
  }

  if (message.type === 'TRANSCRIPTION_ERROR') {
    console.error('Transcription error:', message.error);
    if (activeTabId) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'SHOW_SUBTITLE',
        text: 'Error: ' + message.error,
        isInterim: false
      }).catch(() => {});
    }
  }

  if (message.type === 'TRANSCRIPTION_STARTED') {
    console.log('Transcription started successfully');
  }
});

async function startCapture(settings) {
  console.log('Starting capture...');

  // Stop any existing capture
  await stopCapture();

  // Get active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  console.log('Active tab:', tab.id, tab.url);
  activeTabId = tab.id;

  // Initialize content script
  try {
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'INIT_SUBTITLES',
      settings: {
        fontSize: settings.fontSize,
        position: settings.position
      }
    });
    console.log('Content script initialized');
  } catch (e) {
    console.log('Content script init error:', e.message);
  }

  // Create offscreen document
  await ensureOffscreenDocument();

  // Get tab capture stream ID
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: activeTabId
  });
  console.log('Got stream ID:', streamId);

  // Small delay for offscreen document
  await new Promise(resolve => setTimeout(resolve, 200));

  // Start transcription
  chrome.runtime.sendMessage({
    type: 'START_TRANSCRIPTION',
    streamId,
    settings
  });

  console.log('Transcription request sent');
}

async function stopCapture() {
  console.log('Stopping capture...');

  // Stop transcription
  try {
    chrome.runtime.sendMessage({ type: 'STOP_TRANSCRIPTION' });
  } catch (e) {
    // Ignore
  }

  // Stop subtitles
  if (activeTabId) {
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'STOP_SUBTITLES' });
    } catch (e) {
      // Ignore
    }
  }

  // Close offscreen document
  await closeOffscreenDocument();

  activeTabId = null;
}

async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (contexts.length > 0) {
    console.log('Offscreen document exists');
    return;
  }

  console.log('Creating offscreen document...');
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Tab audio capture for transcription'
  });
  console.log('Offscreen document created');
}

async function closeOffscreenDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length > 0) {
      await chrome.offscreen.closeDocument();
      console.log('Offscreen document closed');
    }
  } catch (e) {
    console.log('Close offscreen error:', e.message);
  }
}
