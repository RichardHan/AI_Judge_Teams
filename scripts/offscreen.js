console.log('[OFFSCREEN_SCRIPT] Offscreen script loaded and ready.');

let mediaRecorder = null;
let audioChunks = [];
let capturedStream = null; // To keep track of the stream from getUserMedia
let audioContext = null; // For routing audio to speakers
let sourceNode = null;
let gainNode = null;

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Only process messages intended for the offscreen document
  if (message.target !== 'offscreen') {
    console.log('[OFFSCREEN_SCRIPT] Ignoring message not targeted for offscreen:', message);
    return false; // Don't indicate async response for ignored messages
  }

  console.log('[OFFSCREEN_SCRIPT] Received message for offscreen document:', message);
  
  try {
    switch (message.action) {
      case 'startOffscreenCapture':
        if (!message.streamId) {
          console.error('[OFFSCREEN_SCRIPT] No streamId provided for startOffscreenCapture.');
          chrome.runtime.sendMessage({ 
            target: 'background',
            action: 'offscreenCaptureError', 
            error: 'No streamId received by offscreen document.'
          });
          sendResponse({ success: false, error: 'No streamId' });
          return true;
        }
        await startOffscreenRecordingWithStreamId(message.streamId, message.mimeType);
        sendResponse({ success: true, message: 'Capture started successfully' });
        break;
        
      case 'stopOffscreenRecording':
        await stopOffscreenRecording();
        sendResponse({ success: true, message: 'Recording stopped in offscreen.'});
        break;
        
      case 'restartOffscreenRecording':
        console.log('[OFFSCREEN_SCRIPT] Restarting recording for new segment');
        await restartRecordingForNewSegment();
        sendResponse({ success: true, message: 'Recording restarted for new segment.'});
        break;
        
      // Re-add getRecordingState if needed by popup directly, though background usually gates this
      case 'getRecordingState': 
        sendResponse({ 
          isRecording: mediaRecorder && mediaRecorder.state === 'recording',
          state: mediaRecorder ? mediaRecorder.state : 'inactive'
        });
        break;
        
      default:
        console.warn('[OFFSCREEN_SCRIPT] Unknown action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
        break;
    }
  } catch (error) {
    console.error('[OFFSCREEN_SCRIPT] Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Important for async sendResponse
});

async function startOffscreenRecordingWithStreamId(streamId, mimeType = 'audio/webm') {
  console.log(`[OFFSCREEN_SCRIPT] Starting offscreen recording with streamId: ${streamId}, mimeType: ${mimeType}`);
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    console.warn('[OFFSCREEN_SCRIPT] Recording already in progress. Stopping existing one first.');
    await stopOffscreenRecording(); // Ensure previous recording is fully stopped
  }

  try {
    console.log('[OFFSCREEN_SCRIPT] Calling navigator.mediaDevices.getUserMedia with constraints.');
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    };

    capturedStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log('[OFFSCREEN_SCRIPT] Successfully obtained stream via getUserMedia:', capturedStream);

    if (!capturedStream) {
        console.error('[OFFSCREEN_SCRIPT] getUserMedia returned a null or undefined stream.');
        chrome.runtime.sendMessage({ 
            target: 'background', 
            action: 'offscreenCaptureError', 
            error: 'getUserMedia resolved but the stream is invalid.' 
        });
        return;
    }

    const audioTracks = capturedStream.getAudioTracks();
    if (audioTracks.length === 0) {
        console.error('[OFFSCREEN_SCRIPT] No audio tracks found in the stream from getUserMedia.');
        chrome.runtime.sendMessage({ 
            target: 'background', 
            action: 'offscreenCaptureError', 
            error: 'No audio tracks in stream from tab capture.' 
        });
        capturedStream.getTracks().forEach(track => track.stop()); // Clean up the problematic stream
        capturedStream = null;
        return;
    }
    console.log(`[OFFSCREEN_SCRIPT] Found ${audioTracks.length} audio track(s).`);

    audioChunks = []; // Reset for new recording
    
    // Set up Web Audio API to route audio to speakers while recording
    try {
      console.log('[OFFSCREEN_SCRIPT] Setting up audio routing to speakers...');
      audioContext = new AudioContext();
      sourceNode = audioContext.createMediaStreamSource(capturedStream);
      gainNode = audioContext.createGain();
      
      // Connect the audio chain: source -> gain -> destination (speakers)
      sourceNode.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set initial volume (you can adjust this)
      gainNode.gain.value = 1.0; // Full volume
      
      console.log('[OFFSCREEN_SCRIPT] Audio routing to speakers established');
    } catch (audioError) {
      console.warn('[OFFSCREEN_SCRIPT] Could not set up audio routing to speakers:', audioError);
      // Continue with recording even if speaker routing fails
    }
    
    const supportedMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    let selectedMimeType = mimeType;
    
    if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
      console.warn(`[OFFSCREEN_SCRIPT] Requested MIME type ${selectedMimeType} not supported.`);
      selectedMimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || supportedMimeTypes[0];
      console.log(`[OFFSCREEN_SCRIPT] Using fallback MIME type: ${selectedMimeType}`);
    }

    mediaRecorder = new MediaRecorder(capturedStream, { mimeType: selectedMimeType });
    console.log('[OFFSCREEN_SCRIPT] MediaRecorder created successfully with type:', selectedMimeType);
    
    mediaRecorder.ondataavailable = (event) => {
      console.log('[OFFSCREEN_SCRIPT] Data available:', event.data.size, 'bytes');
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('[OFFSCREEN_SCRIPT] Recording stopped, chunks collected:', audioChunks.length);
      
      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: selectedMimeType });
        console.log('[OFFSCREEN_SCRIPT] Created audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1]; // Get base64 part
          console.log('[OFFSCREEN_SCRIPT] Sending audio data to background script.');
          chrome.runtime.sendMessage({
            target: 'background',
            action: 'audioRecordedOffscreen',
            audioData: base64data,
            mimeType: selectedMimeType,
            timestamp: new Date().toISOString()
          });
        };
        reader.readAsDataURL(audioBlob);
      }
      audioChunks = []; // Clear chunks for next recording
      // Do not stop capturedStream tracks here if we plan to reuse or if background controls overall lifecycle
      // It will be stopped in stopOffscreenRecording or when offscreen document closes.
    };
    
    mediaRecorder.onerror = (event) => {
      console.error('[OFFSCREEN_SCRIPT] MediaRecorder error:', event.error);
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'offscreenCaptureError',
        error: `MediaRecorder error: ${event.error.name} - ${event.error.message}`
      });
    };
    
    mediaRecorder.start(); // Default timeslice, or pass one e.g. mediaRecorder.start(5000) for 5s chunks
    console.log('[OFFSCREEN_SCRIPT] MediaRecorder started.');
    
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'offscreenCaptureStarted',
      message: 'Recording successfully started in offscreen document.'
    });
    
  } catch (error) {
    console.error('[OFFSCREEN_SCRIPT] Error starting offscreen recording:', error);
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'offscreenCaptureError',
      error: `Error in startOffscreenRecordingWithStreamId: ${error.name} - ${error.message}`
    });
  }
}

async function restartRecordingForNewSegment() {
  console.log('[OFFSCREEN_SCRIPT] restartRecordingForNewSegment called');
  
  if (!mediaRecorder) {
    console.warn('[OFFSCREEN_SCRIPT] No active MediaRecorder to restart');
    return;
  }
  
  if (mediaRecorder.state === 'recording') {
    console.log('[OFFSCREEN_SCRIPT] Stopping current recording to start new segment');
    
    // Create a promise to wait for the stop event to complete
    await new Promise((resolve) => {
      const originalOnStop = mediaRecorder.onstop;
      
      mediaRecorder.onstop = () => {
        // Call the original onstop handler
        if (originalOnStop) {
          originalOnStop();
        }
        resolve();
      };
      
      mediaRecorder.stop();
    });
    
    // Reduce delay to minimize audio gap
    await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms to 50ms
  }
  
  if (capturedStream && capturedStream.active) {
    console.log('[OFFSCREEN_SCRIPT] Restarting recording with existing stream (audio routing maintained)');
    
    // Reset audio chunks for new segment
    audioChunks = [];
    
    // Note: We don't recreate the audio routing (audioContext, sourceNode, gainNode) 
    // because it should continue running to maintain audio output to speakers
    
    // Determine MIME type (reuse logic from startOffscreenRecordingWithStreamId)
    const supportedMimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    let selectedMimeType = supportedMimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || supportedMimeTypes[0];
    
    try {
      mediaRecorder = new MediaRecorder(capturedStream, { mimeType: selectedMimeType });
      console.log('[OFFSCREEN_SCRIPT] New MediaRecorder created for segment with type:', selectedMimeType);
      
      // Set up event handlers (same as in startOffscreenRecordingWithStreamId)
      mediaRecorder.ondataavailable = (event) => {
        console.log('[OFFSCREEN_SCRIPT] Data available for new segment:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('[OFFSCREEN_SCRIPT] Segment recording stopped, chunks collected:', audioChunks.length);
        
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: selectedMimeType });
          console.log('[OFFSCREEN_SCRIPT] Created audio blob for segment:', audioBlob.size, 'bytes, type:', audioBlob.type);
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            console.log('[OFFSCREEN_SCRIPT] Sending segment audio data to background script.');
            chrome.runtime.sendMessage({
              target: 'background',
              action: 'audioRecordedOffscreen',
              audioData: base64data,
              mimeType: selectedMimeType,
              timestamp: new Date().toISOString()
            });
          };
          reader.readAsDataURL(audioBlob);
        }
        audioChunks = [];
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('[OFFSCREEN_SCRIPT] MediaRecorder error for segment:', event.error);
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'offscreenCaptureError',
          error: `MediaRecorder segment error: ${event.error.name} - ${event.error.message}`
        });
      };
      
      // Start recording immediately to minimize gap
      mediaRecorder.start();
      console.log('[OFFSCREEN_SCRIPT] New segment recording started (minimal interruption)');
      
    } catch (error) {
      console.error('[OFFSCREEN_SCRIPT] Error restarting recording for new segment:', error);
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'offscreenCaptureError',
        error: `Error restarting segment recording: ${error.name} - ${error.message}`
      });
    }
    
  } else {
    console.error('[OFFSCREEN_SCRIPT] No active stream available for restart');
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'offscreenCaptureError',
      error: 'No active stream available to restart recording'
    });
  }
}

async function stopOffscreenRecording() {
  console.log('[OFFSCREEN_SCRIPT] stopOffscreenRecording called.');
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop(); // This will trigger ondataavailable (if anything buffered) and onstop
    console.log('[OFFSCREEN_SCRIPT] MediaRecorder.stop() called.');
  } else {
    console.log('[OFFSCREEN_SCRIPT] MediaRecorder not active or not recording. No action to stop recorder.');
  }

  // Clean up the stream obtained by getUserMedia
  if (capturedStream) {
    console.log('[OFFSCREEN_SCRIPT] Stopping tracks of captured stream.');
    capturedStream.getTracks().forEach(track => track.stop());
    capturedStream = null;
  }
  
  // Clean up Web Audio API resources to stop audio routing to speakers
  if (sourceNode) {
    console.log('[OFFSCREEN_SCRIPT] Disconnecting audio source node.');
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (gainNode) {
    console.log('[OFFSCREEN_SCRIPT] Disconnecting gain node.');
    gainNode.disconnect();
    gainNode = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    console.log('[OFFSCREEN_SCRIPT] Closing audio context.');
    audioContext.close();
    audioContext = null;
  }
  
  mediaRecorder = null; // Ensure recorder is reset
  audioChunks = []; // Clear any remaining chunks
} 