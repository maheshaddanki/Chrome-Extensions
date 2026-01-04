// Offscreen document for speech recognition
let recognition = null;
let mediaStream = null;
let audioContext = null;
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
    console.log('Starting recognition with streamId:', streamId);

    // Get media stream from tab capture
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    console.log('Media stream obtained:', mediaStream);

    // Create audio context to keep the stream active
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(mediaStream);

    // Create a destination to keep audio playing (needed for speech recognition to work)
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);

    // Also connect to speakers so user can hear the audio
    source.connect(audioContext.destination);

    // Initialize Web Speech API
    // Note: Web Speech API uses the system microphone, not the tab audio directly
    // So we need to use a workaround - play through speakers and use mic to capture
    // OR use the microphone directly to capture audio from speakers

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported');
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = settings.language || 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('Speech recognition started successfully');
      chrome.runtime.sendMessage({
        type: 'RECOGNITION_STARTED'
      });
    };

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

      console.log('Transcription result:', { finalTranscript, interimTranscript });

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
      if (event.error === 'no-speech' || event.error === 'aborted') {
        if (isRecognizing) {
          setTimeout(() => {
            if (isRecognizing && recognition) {
              try {
                recognition.start();
                console.log('Restarting recognition after error:', event.error);
              } catch (e) {
                console.log('Could not restart:', e.message);
              }
            }
          }, 500);
        }
      } else if (event.error === 'not-allowed') {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_ERROR',
          error: 'Microphone access denied. Please allow microphone permission.'
        });
      } else {
        chrome.runtime.sendMessage({
          type: 'TRANSCRIPTION_ERROR',
          error: event.error
        });
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      // Restart recognition if still active
      if (isRecognizing) {
        setTimeout(() => {
          if (isRecognizing && recognition) {
            try {
              recognition.start();
              console.log('Restarting recognition after end');
            } catch (e) {
              console.log('Could not restart after end:', e.message);
            }
          }
        }, 300);
      }
    };

    // Start recognition
    isRecognizing = true;
    recognition.start();

    console.log('Speech recognition initialization complete');

  } catch (error) {
    console.error('Failed to start recognition:', error);
    chrome.runtime.sendMessage({
      type: 'TRANSCRIPTION_ERROR',
      error: error.message
    });
  }
}

function stopRecognition() {
  console.log('Stopping recognition...');
  isRecognizing = false;

  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {
      // Ignore
    }
    recognition = null;
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

  console.log('Speech recognition stopped');
}
