console.log('[BACKGROUND_SCRIPT] background.js script started');
// 背景腳本狀態管理
let captureState = {
  isCapturing: false,
  activeTeamId: null,
  captureMode: null,
  startTime: null,
  segmentNumber: 0  // Track segment number to help with file naming
};

// 錄音相關
let captureStream = null;
let mediaRecorder = null;
let audioChunks = [];
let transcribeInterval = null;
let activeTabId = null;
let recordingActiveTab = null; // Store the active tab ID we're recording from

// 初始化監聽器
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Hackathon Judge 擴展已安裝');
  console.log('[BACKGROUND_SCRIPT] onInstalled listener triggered');
});

// 訊息處理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from sender:', sender);
  
  switch (message.action) {
    case 'getCaptureState':
      console.log('[BACKGROUND_SCRIPT] Action: getCaptureState');
      sendResponse({
        isCapturing: captureState.isCapturing,
        activeTeamId: captureState.activeTeamId
      });
      break;
      
    case 'startCapture':
      console.log('[BACKGROUND_SCRIPT] Action: startCapture', message.options);
      console.log('[BACKGROUND_SCRIPT] Checking MediaRecorder MIME type support:');
      console.log(`  audio/webm: ${MediaRecorder.isTypeSupported('audio/webm')}`);
      console.log(`  audio/opus: ${MediaRecorder.isTypeSupported('audio/opus')}`); // Opus is often used in webm
      console.log(`  audio/ogg; codecs=opus: ${MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')}`);
      console.log(`  audio/mpeg: ${MediaRecorder.isTypeSupported('audio/mpeg')}`); // For MP3
      console.log(`  audio/mp3: ${MediaRecorder.isTypeSupported('audio/mp3')}`);   // Also for MP3
      try {
        // 如果已經在捕獲，先停止
        if (captureState.isCapturing) {
          console.log('[BACKGROUND_SCRIPT] Already capturing, stopping existing capture first.');
          stopCapturing();
        }
        
        // Store state before starting capture
        captureState.isCapturing = true;
        captureState.activeTeamId = message.options.teamId;
        console.log(`[BACKGROUND_SCRIPT] captureState.activeTeamId set to: ${captureState.activeTeamId} from message options.`);
        captureState.captureMode = message.options.captureMode;
        captureState.startTime = Date.now();
        captureState.segmentNumber = 0; // Reset segment counter
        
        // Start the first segment capture - this will also set the recordingActiveTab value
        captureNewSegment();
        
        // Set interval to capture new segments every 10 seconds
        if (transcribeInterval) clearInterval(transcribeInterval);
        transcribeInterval = setInterval(() => {
          if (captureState.isCapturing) {
            // Stop current recording if it exists
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              console.log('[BACKGROUND_SCRIPT] Stopping current segment recording to start a new one');
              mediaRecorder.stop();
              // Processing of this segment will happen in mediaRecorder.onstop handler
            }
            
            // Wait a small amount of time to ensure previous recorder has finished
            setTimeout(() => {
              // Only start a new capture if we're still recording
              if (captureState.isCapturing) {
                captureNewSegment();
              }
            }, 500);
          }
        }, 10000);
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('開始捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'stopCapture':
      console.log('[BACKGROUND_SCRIPT] Action: stopCapture');
      try {
        stopCapturing();
        sendResponse({ success: true });
        console.log('[BACKGROUND_SCRIPT] stopCapture successful.');
        
        // 通知所有打開的擴展頁面狀態已更改
        chrome.runtime.sendMessage({
          action: 'captureStateChanged',
          state: {
            isCapturing: captureState.isCapturing
          }
        });
      } catch (error) {
        console.error('停止捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'setActiveTeam':
      console.log('[BACKGROUND_SCRIPT] Action: setActiveTeam', message.teamId);
      try {
        if (!captureState.isCapturing) {
          captureState.activeTeamId = message.teamId;
          sendResponse({ success: true });
        } else {
          sendResponse({ 
            success: false, 
            error: 'Cannot change team while capturing is active' 
          });
        }
      } catch (error) {
        console.error('設置團隊失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  // 為異步響應返回 true
  return true;
});

// Function to capture a new segment with a fresh stream
function captureNewSegment() {
  console.log('[BACKGROUND_SCRIPT] Starting new segment capture');
  
  // First check if we're still on the tab we want to record
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('[BACKGROUND_SCRIPT] No active tab found for recording');
      return;
    }
    
    const currentActiveTab = tabs[0].id;
    
    // If this is the first segment, set recordingActiveTab
    if (!recordingActiveTab) {
      recordingActiveTab = currentActiveTab;
      console.log(`[BACKGROUND_SCRIPT] Recording from active tab with ID: ${recordingActiveTab}`);
    } else if (currentActiveTab !== recordingActiveTab) {
      console.warn(`[BACKGROUND_SCRIPT] WARNING: Active tab has changed from ${recordingActiveTab} to ${currentActiveTab}. Please return to the original tab for best results.`);
      // We could send a notification to the popup here to alert the user
    }
    
    // 啟動捕獲程序
    console.log('[BACKGROUND_SCRIPT] Attempting to start capture. Checking chrome.tabCapture object:', chrome.tabCapture);
    if (chrome.tabCapture && typeof chrome.tabCapture.capture === 'function') {
      console.log('[BACKGROUND_SCRIPT] chrome.tabCapture.capture IS a function.');
    } else {
      console.error('[BACKGROUND_SCRIPT] chrome.tabCapture.capture IS NOT a function or chrome.tabCapture is undefined.');
      return;
    }
    
    // NOTE: chrome.tabCapture.capture can only capture the currently active tab
    // It does not support specifying a tabId, so we removed that parameter
    chrome.tabCapture.capture({ audio: true, video: false }, stream => {
      if (!stream) {
        console.error('[BACKGROUND_SCRIPT] Failed to capture tab audio for new segment');
        return;
      }
      console.log('[BACKGROUND_SCRIPT] Tab capture successful for new segment, stream obtained.');
      
      console.log('[BACKGROUND_SCRIPT] Attempting to inspect audio tracks...');
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((track, index) => {
          console.log(`[BACKGROUND_SCRIPT] Audio Track ${index}: id=${track.id}, label='${track.label}', enabled=${track.enabled}, muted=${track.muted}, readyState='${track.readyState}'`);
          // Log when track events occur DURING the recording
          track.onended = () => console.error(`[BACKGROUND_SCRIPT] CRITICAL: Audio Track ${index} (ID: ${track.id}) for stream ${stream.id} has ENDED.`);
          track.onmute = () => console.warn(`[BACKGROUND_SCRIPT] WARNING: Audio Track ${index} (ID: ${track.id}) for stream ${stream.id} has been MUTED.`);
          track.onunmute = () => console.log(`[BACKGROUND_SCRIPT] Audio Track ${index} (ID: ${track.id}) for stream ${stream.id} has been UNMUTED.`);
        });
      } else {
        console.warn('[BACKGROUND_SCRIPT] No audio tracks found in the captured stream!');
      }
      console.log('[BACKGROUND_SCRIPT] Finished inspecting audio tracks.');
      
      // Store the new stream
      if (captureStream) {
        // Safely close the old stream before replacing it
        captureStream.getTracks().forEach(track => track.stop());
      }
      captureStream = stream;
      
      // Reset audioChunks for the new segment
      audioChunks = [];
      
      // Increment segment counter
      captureState.segmentNumber++;
      console.log(`[BACKGROUND_SCRIPT] Recording segment #${captureState.segmentNumber}`);
      
      // 設置音訊錄製
      mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorder.ondataavailable = e => {
        console.log('[BACKGROUND_SCRIPT] ondataavailable triggered.');
        if (e.data.size > 0) {
          audioChunks.push(e.data);
          console.log('收集音訊區塊:', audioChunks.length, e.data.size, 'bytes', 'Current audioChunks (sizes):', JSON.stringify(audioChunks.map(chunk => chunk.size)));
        }
      };
      
      mediaRecorder.onerror = (event) => {
        console.error('[BACKGROUND_SCRIPT] MediaRecorder error:', event.error);
      };
      
      mediaRecorder.onstop = () => {
        console.log(`[BACKGROUND_SCRIPT] mediaRecorder.onstop event fired for segment #${captureState.segmentNumber}. Current audioChunks.length:`, audioChunks.length);
        if (audioChunks.length > 0) {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const isFinal = !captureState.isCapturing; // If we're no longer capturing, this is the final segment
          
          // Save the segment
          saveAudioBlobToFile(audioBlob, isFinal ? "final_segment" : "segment");
          
          // 把音訊 blob 轉成 base64 再傳送
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            console.log(`[BACKGROUND_SCRIPT] Sending ${isFinal ? 'final ' : ''}audioChunk (from onstop) to popup.`);
            chrome.runtime.sendMessage({
              action: 'audioChunk',
              audioBase64: base64data,
              timestamp: new Date().toISOString(),
              isFinal: isFinal
            });
          };
          reader.readAsDataURL(audioBlob);
          
          // Clear chunks after processing
          audioChunks = [];
        } else {
          console.log('[BACKGROUND_SCRIPT] mediaRecorder.onstop: No audio chunks to process.');
        }
        
        // Stop stream tracks when done to avoid resource leaks
        if (captureStream && (!captureState.isCapturing || 
            (mediaRecorder && mediaRecorder.state === 'inactive'))) {
          captureStream.getTracks().forEach(track => {
            if (track.readyState === 'live') {
              track.stop();
            }
          });
          captureStream = null;
        }
      };
      
      // Start recording
      mediaRecorder.start();
      console.log(`[BACKGROUND_SCRIPT] MediaRecorder started for segment #${captureState.segmentNumber}`);
    });
  });
}

// 停止所有捕獲
function stopCapturing() {
  console.log('[BACKGROUND_SCRIPT] stopCapturing called.');
  
  // Set state flag first so no new segments will start
  captureState.isCapturing = false; 
  
  if (transcribeInterval) {
    clearInterval(transcribeInterval);
    transcribeInterval = null;
    console.log('[BACKGROUND_SCRIPT] Transcribe interval cleared.');
  }
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop(); // This will trigger ondataavailable with any final data, then onstop
    console.log('[BACKGROUND_SCRIPT] mediaRecorder.stop() called.');
  }
  
  // Clean up stream even if mediaRecorder is not active or not exist
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
    console.log('[BACKGROUND_SCRIPT] Capture stream tracks stopped.');
  }
  
  console.log('[BACKGROUND_SCRIPT] stopCapturing finished. isCapturing:', captureState.isCapturing);
  
  // Notify all open extension pages of state change
  chrome.runtime.sendMessage({
    action: 'captureStateChanged',
    state: {
      isCapturing: captureState.isCapturing
    }
  });
}

// Helper function to save audio blob to a file
function saveAudioBlobToFile(audioBlob, segmentType) {
  console.log(`[BACKGROUND_SCRIPT] saveAudioBlobToFile called. Current activeTeamId: ${captureState.activeTeamId}, segmentType: ${segmentType}`);
  if (!captureState.activeTeamId) {
    console.warn('[BACKGROUND_SCRIPT] saveAudioBlobToFile: activeTeamId is NOT set. Aborting file save.');
    return;
  }
  console.log(`[BACKGROUND_SCRIPT] saveAudioBlobToFile: activeTeamId is set (${captureState.activeTeamId}). Proceeding to save.`);
  console.log(`[BACKGROUND_SCRIPT] Attempting to save audio file for team: ${captureState.activeTeamId}, segment: ${segmentType}`);

  const timestamp = new Date().toISOString().replace(/:/g, '-'); // Sanitize timestamp for filename
  const filename = `audio_capture/${captureState.activeTeamId}_${segmentType}_${timestamp}.webm`;
  const url = URL.createObjectURL(audioBlob);

  console.log(`[BACKGROUND_SCRIPT] Attempting to download: Filename: '${filename}', Blob URL: '${url}', Blob size: ${audioBlob.size} bytes`);

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false // Set to true if you want the user to be prompted for save location each time
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error(`[BACKGROUND_SCRIPT] Error downloading audio file '${filename}':`, chrome.runtime.lastError.message, chrome.runtime.lastError);
    } else {
      console.log(`[BACKGROUND_SCRIPT] Audio segment '${filename}' save initiated. Download ID: ${downloadId || 'N/A (already downloaded or no ID provided)'}`);
    }
    // It's good practice to revoke the object URL, but Chrome handles it for completed downloads.
    // Consider revoking if downloadId is undefined or if an error occurs and the download didn't start.
    // For simplicity, we rely on Chrome's default behavior for now.
    // URL.revokeObjectURL(url); 
  });
}