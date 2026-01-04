// Offscreen document for speech recognition
let recognition = null;
let mediaStream = null;
let isRecognizing = false;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_RECOGNITION') {
    startRecognition(message.streamId, message.settings);
  }

  if (message.type === 'STOP_RECOGNITION') {
    stopRecognition();
  }
});

async function startRecognition(streamId, settings) {
  try {
    // Get media stream from tab capture
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported');
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = settings.language || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Send final results
      if (finalTranscript) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_RESULT',
          text: finalTranscript,
          isInterim: false
        });
      }

      // Send interim results
      if (interimTranscript) {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_RESULT',
          text: interimTranscript,
          isInterim: true
        });
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);

      // Restart on recoverable errors
      if (event.error === 'no-speech' || event.error === 'audio-capture') {
        if (isRecognizing) {
          setTimeout(() => {
            if (isRecognizing) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore if already started
              }
            }
          }, 100);
        }
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_ERROR',
          error: event.error
        });
      }
    };

    recognition.onend = () => {
      // Restart recognition if still active
      if (isRecognizing) {
        setTimeout(() => {
          if (isRecognizing && recognition) {
            try {
              recognition.start();
            } catch (e) {
              // Ignore if already started
            }
          }
        }, 100);
      }
    };

    // Start recognition
    isRecognizing = true;
    recognition.start();

    console.log('Speech recognition started');

  } catch (error) {
    console.error('Failed to start recognition:', error);
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_ERROR',
      error: error.message
    });
  }
}

function stopRecognition() {
  isRecognizing = false;

  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      // Ignore
    }
    recognition = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  console.log('Speech recognition stopped');
}
