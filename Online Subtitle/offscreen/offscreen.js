// Offscreen document for Deepgram real-time transcription
let mediaStream = null;
let audioContext = null;
let websocket = null;
let processor = null;
let isTranscribing = false;

console.log('Offscreen document loaded');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received:', message.type);

  if (message.type === 'START_TRANSCRIPTION') {
    startTranscription(message.streamId, message.settings);
  }

  if (message.type === 'STOP_TRANSCRIPTION') {
    stopTranscription();
  }
});

async function startTranscription(streamId, settings) {
  try {
    console.log('Starting Deepgram transcription...');

    // Get media stream from tab capture
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    console.log('Tab audio stream obtained');

    // Set up audio context for processing
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Create script processor for audio data
    processor = audioContext.createScriptProcessor(4096, 1, 1);

    // Connect to Deepgram WebSocket
    const language = settings.language || 'en';
    const wsUrl = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&language=${language}&punctuate=true&interim_results=true`;

    websocket = new WebSocket(wsUrl, ['token', settings.apiKey]);

    websocket.onopen = () => {
      console.log('Deepgram WebSocket connected');
      isTranscribing = true;

      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_STARTED'
      });

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcmData = convertFloat32ToInt16(inputData);
          websocket.send(pcmData.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
          const transcript = data.channel.alternatives[0].transcript;
          const isFinal = data.is_final;

          if (transcript && transcript.trim()) {
            console.log('Transcript:', transcript, 'Final:', isFinal);

            chrome.runtime.sendMessage({
              type: 'TRANSCRIPTION_RESULT',
              text: transcript,
              isInterim: !isFinal
            });
          }
        }
      } catch (e) {
        console.error('Error parsing Deepgram response:', e);
      }
    };

    websocket.onerror = (error) => {
      console.error('Deepgram WebSocket error:', error);
      chrome.runtime.sendMessage({
        type: 'TRANSCRIPTION_ERROR',
        error: 'Connection error. Check your API key.'
      });
    };

    websocket.onclose = (event) => {
      console.log('Deepgram WebSocket closed:', event.code, event.reason);

      if (isTranscribing && event.code !== 1000) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_ERROR',
          error: event.reason || 'Connection closed unexpectedly'
        });
      }
    };

  } catch (error) {
    console.error('Failed to start transcription:', error);
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_ERROR',
      error: error.message
    });
  }
}

function convertFloat32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

function stopTranscription() {
  console.log('Stopping transcription...');
  isTranscribing = false;

  if (websocket) {
    try {
      websocket.close(1000, 'User stopped');
    } catch (e) {
      // Ignore
    }
    websocket = null;
  }

  if (processor) {
    try {
      processor.disconnect();
    } catch (e) {
      // Ignore
    }
    processor = null;
  }

  if (audioContext) {
    try {
      audioContext.close();
    } catch (e) {
      // Ignore
    }
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  console.log('Transcription stopped');
}
