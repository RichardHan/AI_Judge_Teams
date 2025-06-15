console.log('[BACKGROUND_SCRIPT] background.js script started');
// 背景腳本狀態管理
let captureState = {
  isCapturing: false,
  activeTeamId: null,
  captureMode: null,
  startTime: null,
  segmentNumber: 0,  // Track segment number to help with file naming
  downloadFiles: false, // 控制是否下載音訊檔案
  transcriptChunks: [], // 儲存轉錄片段以便popup重新打開時恢復
  lastScreenshotDataUrl: null,
  acceptingTranscriptions: false, // 新增：控制是否接受新的轉錄結果
  saveScheduled: false, // 新增：防止重複保存的標誌
  pendingApiCalls: 0, // Track pending API calls (transcription & screenshots)
  saveTimeoutId: null, // Store timeout ID for early completion
  progressiveSaveInterval: null, // Progressive save interval ID
  lastProgressiveSaveTime: null, // Last time we saved progressively
  stopRequestTime: null // Track when stop was requested
};

// 錄音相關
let captureStream = null;
let mediaRecorder = null;
let audioChunks = [];
let transcribeInterval = null;
let screenshotInterval = null; // 截圖間隔計時器
let activeTabId = null;
let recordingActiveTab = null; // Store the active tab ID we're recording from

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Function to ensure the offscreen document is active
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });

  if (existingContexts.length > 0) {
    console.log('[BACKGROUND_SCRIPT] Offscreen document already exists.');
    return;
  }

  console.log('[BACKGROUND_SCRIPT] Creating offscreen document.');
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: ['USER_MEDIA'],
    justification: 'Audio capture and processing requires an offscreen document for MediaRecorder and getUserMedia access.'
  });
}

// 載入保存的團隊選擇
function loadSavedTeamSelection() {
  chrome.storage.local.get(['selected_team_id'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('[BACKGROUND_SCRIPT] Error loading saved team selection:', chrome.runtime.lastError);
      return;
    }
    
    const savedTeamId = result.selected_team_id;
    if (savedTeamId) {
      captureState.activeTeamId = savedTeamId;
      console.log('[BACKGROUND_SCRIPT] Loaded saved team selection:', savedTeamId);
    } else {
      console.log('[BACKGROUND_SCRIPT] No saved team selection found');
    }
  });
}

// 初始化監聽器
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Hackathon Judge 擴展已安裝');
  console.log('[BACKGROUND_SCRIPT] onInstalled listener triggered');
  // 載入保存的團隊選擇
  loadSavedTeamSelection();
});

// 當擴展啟動時也載入保存的團隊選擇
chrome.runtime.onStartup.addListener(() => {
  console.log('[BACKGROUND_SCRIPT] Extension startup - loading saved team selection');
  loadSavedTeamSelection();
});

// 訊息處理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from sender:', sender);
  
  // Handle messages from offscreen document first
  if (message.target === 'background') {
    console.log('[BACKGROUND_SCRIPT] Received message from offscreen:', message);
    if (message.action === 'offscreenCaptureStarted') {
      console.log('[BACKGROUND_SCRIPT] Offscreen document confirmed capture started.');
      sendResponse({ success: true });
      return true;
    } else if (message.action === 'offscreenCaptureError') {
      console.error('[BACKGROUND_SCRIPT] Error reported from offscreen document:', message.error);
      chrome.runtime.sendMessage({ action: 'audioCaptureError', error: `Offscreen: ${message.error}` }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (audioCaptureError) - recipient may not be available:', err.message);
      });
      stopCapturing(); // Stop if offscreen fails
      sendResponse({ success: true });
      return true;
    } else if (message.action === 'audioRecordedOffscreen') {
      console.log('[BACKGROUND_SCRIPT] Received recorded audio data from offscreen.');
      console.log('  MIME Type:', message.mimeType);
      console.log('  Timestamp:', message.timestamp);
      console.log('  Audio Data (base64 preview):', message.audioData ? message.audioData.substring(0, 50) + '...' : 'No data');
      // Call your transcription function here
      if (message.audioData) {
        processAudioChunkInBackground(message.audioData, message.timestamp, false);
      }
      sendResponse({ success: true });
      return true;
    } else {
      // Handle any other offscreen messages
      console.warn('[BACKGROUND_SCRIPT] Unknown offscreen message action:', message.action);
      sendResponse({ success: false, error: 'Unknown offscreen action' });
      return true;
    }
  }
  
  // Handle messages from popup/content scripts
  switch (message.action) {
    case 'getCaptureState':
      console.log('[BACKGROUND_SCRIPT] Action: getCaptureState. Current captureState:', JSON.stringify(captureState));
      sendResponse({
        isCapturing: captureState.isCapturing,
        activeTeamId: captureState.activeTeamId,
        transcriptChunks: captureState.transcriptChunks
      });
      break;
      
    case 'startCapture':
      console.log('[BACKGROUND_SCRIPT] Action: startCapture. Received options:', JSON.stringify(message.options));
      // MediaRecorder is not available in Manifest V3 service workers, so we skip the MIME type checks
      console.log('[BACKGROUND_SCRIPT] Starting capture process (MediaRecorder checks skipped in service worker)');
      try {
        // 如果已經在捕獲，先停止
        if (captureState.isCapturing) {
          console.log('[BACKGROUND_SCRIPT] Already capturing, stopping existing capture first.');
          stopCapturing();
        }
        
        // Store state before starting capture
        captureState.isCapturing = true;
        captureState.acceptingTranscriptions = true; // 開始接受轉錄結果
        captureState.saveScheduled = false; // 重置保存標誌
        captureState.activeTeamId = message.options.teamId;
        console.log(`[BACKGROUND_SCRIPT] captureState.activeTeamId explicitly set to: ${captureState.activeTeamId} from message options.`);
        captureState.captureMode = message.options.captureMode;
        captureState.startTime = Date.now();
        captureState.segmentNumber = 0; // Reset segment counter
        captureState.downloadFiles = message.options.downloadFiles || false; // 設置是否下載檔案
        captureState.transcriptChunks = []; // 重置轉錄片段
        captureState.pendingApiCalls = 0; // Reset pending API calls counter
        captureState.lastProgressiveSaveTime = Date.now();
        captureState.stopRequestTime = null;
        console.log(`[BACKGROUND_SCRIPT] Download files set to: ${captureState.downloadFiles}`);
        console.log('[BACKGROUND_SCRIPT] captureState after updates in startCapture:', JSON.stringify(captureState));
        
        // Start progressive save interval (save every 30 seconds)
        startProgressiveSave();
        
        // Start the first segment capture - this will also set the recordingActiveTab value
        captureNewSegment();
        
        // Get transcription interval from storage (default 10 seconds)
        getFromStorage('transcription_interval').then(interval => {
          const transcriptionIntervalMs = (parseInt(interval) || 10) * 1000;
          console.log(`[BACKGROUND_SCRIPT] Setting transcription interval to ${transcriptionIntervalMs}ms`);
          
          // Set interval to capture new segments
          transcribeInterval = setInterval(() => {
          if (captureState.isCapturing) {
            // 检查扩展是否仍然有效
            if (!chrome.tabCapture || !chrome.tabCapture.getMediaStreamId) {
              console.error('[BACKGROUND_SCRIPT] Extension appears to be disabled during recording. Stopping audio capture.');
              chrome.runtime.sendMessage({
                action: 'extensionDisabled',
                error: 'Extension became disabled during recording. Audio transcription stopped.'
              }).catch(err => {
                console.log('[BACKGROUND_SCRIPT] Broadcast message (extensionDisabled) - recipient may not be available:', err.message);
              });
              // 清除音频相关的间隔，但保留截图功能
              if (transcribeInterval) {
                clearInterval(transcribeInterval);
                transcribeInterval = null;
              }
              return;
            }
            
            // Instead of getting a new streamId, tell offscreen to restart recording with existing stream
            console.log('[BACKGROUND_SCRIPT] Requesting offscreen to restart recording for new segment');
            chrome.runtime.sendMessage({
              action: 'restartOffscreenRecording',
              target: 'offscreen'
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('[BACKGROUND_SCRIPT] Error sending restartOffscreenRecording message:', chrome.runtime.lastError.message);
              } else {
                console.log('[BACKGROUND_SCRIPT] restartOffscreenRecording response:', response);
              }
            });
          }
          }, transcriptionIntervalMs);
        });
        
        // Get screenshot interval from storage (default 10 seconds)
        getFromStorage('screenshot_interval').then(interval => {
          const screenshotIntervalMs = (parseInt(interval) || 20) * 1000;
          console.log(`[BACKGROUND_SCRIPT] Setting screenshot interval to ${screenshotIntervalMs}ms`);
          
          // Set interval to capture screenshots
          screenshotInterval = setInterval(() => {
          if (captureState.isCapturing) {
            // Check if screenshot analysis is enabled
            getFromStorage('enable_screenshot_analysis').then(enableScreenshotAnalysis => {
              if (enableScreenshotAnalysis !== 'false') {
                captureScreenshot();
              }
            });
          }
          }, screenshotIntervalMs);
        });
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('開始捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'stopCapture':
      console.log('[BACKGROUND_SCRIPT] Action: stopCapture. Current captureState before stop:', JSON.stringify(captureState));
      try {
        stopCapturing();
        sendResponse({ success: true });
        console.log('[BACKGROUND_SCRIPT] stopCapture successful. captureState after stop:', JSON.stringify(captureState));
      } catch (error) {
        console.error('停止捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'setActiveTeam':
      console.log('[BACKGROUND_SCRIPT] Action: setActiveTeam. Received teamId:', message.teamId, '. Current captureState:', JSON.stringify(captureState));
      try {
        if (!captureState.isCapturing) {
          captureState.activeTeamId = message.teamId;
          // 同時保存到chrome.storage.local以便持久化
          chrome.storage.local.set({ 'selected_team_id': message.teamId }, () => {
            if (chrome.runtime.lastError) {
              console.error('[BACKGROUND_SCRIPT] Error saving team selection:', chrome.runtime.lastError);
            } else {
              console.log('[BACKGROUND_SCRIPT] Team selection saved to storage:', message.teamId);
            }
          });
          console.log('[BACKGROUND_SCRIPT] setActiveTeam: captureState.activeTeamId updated to:', captureState.activeTeamId);
          sendResponse({ success: true });
        } else {
          console.warn('[BACKGROUND_SCRIPT] setActiveTeam: Cannot change team while capturing is active. captureState:', JSON.stringify(captureState));
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
      
    case 'transcriptComplete':
      console.log('[BACKGROUND_SCRIPT] Action: transcriptComplete. Received transcript:', message.transcript);
      try {
        // 將轉錄結果保存到 background state
        captureState.transcriptChunks.push(message.transcript);
        console.log('[BACKGROUND_SCRIPT] transcriptComplete: saved transcript chunk. Total chunks:', captureState.transcriptChunks.length);
        
        // 通知所有打開的 extension 頁面更新
        chrome.runtime.sendMessage({
          action: 'transcriptUpdated',
          transcriptChunks: captureState.transcriptChunks
        }).catch(err => {
          // Ignore errors for broadcast messages (no specific recipient)
          console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptUpdated) - recipient may not be available:', err.message);
        });
        
        sendResponse({ success: true });
      } catch (error) {
        console.error('[BACKGROUND_SCRIPT] transcriptComplete error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    case 'clearTranscripts':
      console.log('[BACKGROUND_SCRIPT] Action: clearTranscripts');
      try {
        captureState.transcriptChunks = [];
        console.log('[BACKGROUND_SCRIPT] clearTranscripts: cleared all transcript chunks');
        sendResponse({ success: true });
      } catch (error) {
        console.error('[BACKGROUND_SCRIPT] clearTranscripts error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;

    case 'testScreenshot':
      console.log('[BACKGROUND_SCRIPT] Action: testScreenshot');
      try {
        // Force capture a screenshot for testing
        // Note: captureScreenshot doesn't return a Promise, so we call it directly
        captureScreenshot();
        sendResponse({ success: true, message: 'Screenshot test initiated. Check console for results.' });
      } catch (error) {
        console.error('[BACKGROUND_SCRIPT] testScreenshot error:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    default:
      console.warn('[BACKGROUND_SCRIPT] Unknown action:', message.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  // Return true to indicate we will send a response asynchronously if needed
  return true;
});

// Function to capture a new segment with a fresh stream
function captureNewSegment() {
  console.log('[BACKGROUND_SCRIPT] Starting new segment capture');
  
  // Check if chrome.tabCapture API itself is available
  if (!chrome || !chrome.tabCapture) {
    console.error('[BACKGROUND_SCRIPT] chrome.tabCapture API is completely unavailable.');
    chrome.runtime.sendMessage({
      action: 'extensionDisabled',
      error: 'Chrome tabCapture API is not available. Please reload extension or restart Chrome.'
    });
    return;
  }

  // Log available keys on chrome.tabCapture for debugging
  console.log('[BACKGROUND_SCRIPT] chrome.tabCapture object exists. Available keys:', Object.keys(chrome.tabCapture));

  // Proceed with getMediaStreamId flow
  // First check if we're still on the tab we want to record
  chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
    if (tabs.length === 0) {
      console.error('[BACKGROUND_SCRIPT] No active tab found for recording');
      chrome.runtime.sendMessage({
        action: 'audioCaptureError',
        error: 'No active tab found for recording'
      });
      return;
    }
    
    const currentActiveTab = tabs[0];
    console.log('[BACKGROUND_SCRIPT] Current active tab info:', {
      id: currentActiveTab.id,
      url: currentActiveTab.url,
      title: currentActiveTab.title,
      audible: currentActiveTab.audible,
      mutedInfo: currentActiveTab.mutedInfo
    });
    
    // Check if the tab is eligible for capture
    if (currentActiveTab.url.startsWith('chrome://') || 
        currentActiveTab.url.startsWith('chrome-extension://') ||
        currentActiveTab.url.startsWith('file://')) {
      console.error('[BACKGROUND_SCRIPT] Cannot capture special Chrome pages (chrome://, extension pages, or local files)');
      chrome.runtime.sendMessage({
        action: 'audioCaptureError',
        error: 'Cannot capture audio from Chrome system pages. Please switch to a regular website tab (like Teams).'
      });
      return;
    }
    
    // Check permissions explicitly
    try {
      const hasPermission = await new Promise((resolve) => {
        chrome.permissions.contains({
          permissions: ['tabCapture']
        }, (result) => {
          resolve(result);
        });
      });
      
      if (!hasPermission) {
        console.error('[BACKGROUND_SCRIPT] tabCapture permission not granted');
        chrome.runtime.sendMessage({
          action: 'audioCaptureError',
          error: 'Extension does not have permission to capture tab audio. Please check extension permissions in chrome://extensions/'
        });
        return;
      }
      console.log('[BACKGROUND_SCRIPT] tabCapture permission confirmed');
      
    } catch (permError) {
      console.error('[BACKGROUND_SCRIPT] Error checking permissions:', permError);
    }
    
    // If this is the first segment, set recordingActiveTab
    if (!recordingActiveTab) {
      recordingActiveTab = currentActiveTab.id;
      console.log(`[BACKGROUND_SCRIPT] Recording from active tab with ID: ${recordingActiveTab}`);
    } else if (currentActiveTab.id !== recordingActiveTab) {
      console.warn(`[BACKGROUND_SCRIPT] WARNING: Active tab has changed from ${recordingActiveTab} to ${currentActiveTab.id}. Please return to the original tab for best results.`);
    }
    
    console.log('[BACKGROUND_SCRIPT] Attempting to start capture using getMediaStreamId flow.');

    if (typeof chrome.tabCapture.getMediaStreamId !== 'function') {
        console.error('[BACKGROUND_SCRIPT] chrome.tabCapture.getMediaStreamId IS NOT available or not a function.');
        chrome.runtime.sendMessage({
            action: 'audioCaptureError',
            error: 'Critical error: tabCapture.getMediaStreamId API is not correctly loaded.'
        });
        return;
    }
    console.log('[BACKGROUND_SCRIPT] chrome.tabCapture.getMediaStreamId IS available.');

    try {
      console.log('[BACKGROUND_SCRIPT] Calling chrome.tabCapture.getMediaStreamId for tab ID:', currentActiveTab.id);
      
      chrome.tabCapture.getMediaStreamId({ targetTabId: currentActiveTab.id }, async (streamId) => {
        if (chrome.runtime.lastError) {
          console.error('[BACKGROUND_SCRIPT] Error getting media stream ID:', chrome.runtime.lastError.message);
          chrome.runtime.sendMessage({
            action: 'audioCaptureError',
            error: `Failed to get media stream ID: ${chrome.runtime.lastError.message}`
          });
          return;
        }

        if (!streamId) {
          console.error('[BACKGROUND_SCRIPT] No stream ID returned from getMediaStreamId.');
          chrome.runtime.sendMessage({
            action: 'audioCaptureError',
            error: 'Failed to get a valid stream ID for tab capture.'
          });
          return;
        }
        
        console.log('[BACKGROUND_SCRIPT] Obtained stream ID:', streamId);
        
        // Ensure offscreen document is running and then send the streamId
        await ensureOffscreenDocument();
        console.log('[BACKGROUND_SCRIPT] Sending streamId to offscreen document.');
        chrome.runtime.sendMessage({
          action: 'startOffscreenCapture',
          target: 'offscreen', // To help offscreen.js identify the message
          streamId: streamId,
          mimeType: 'audio/webm' // Or get from settings
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[BACKGROUND_SCRIPT] Error sending startOffscreenCapture message:', chrome.runtime.lastError.message);
          } else {
            console.log('[BACKGROUND_SCRIPT] startOffscreenCapture response:', response);
          }
        });

        // The rest of the stream handling (getUserMedia, MediaRecorder) will now happen in offscreen.js
        // We can listen for messages back from offscreen.js if needed (e.g., capture started, error)

        // For now, let's assume success at this point in background.js if streamId is sent
        // We might want a confirmation message from offscreen.js later.
        captureState.segmentNumber++;
        console.log(`[BACKGROUND_SCRIPT] Recording segment #${captureState.segmentNumber} (offscreen capture initiated)`);
        chrome.runtime.sendMessage({
          action: 'captureStarted',
          message: 'Audio capture initiated via offscreen document.'
        }).catch(err => {
          console.log('[BACKGROUND_SCRIPT] Broadcast message (captureStarted) - recipient may not be available:', err.message);
        });

      }); // End of getMediaStreamId callback
      
    } catch (error) {
      console.error('[BACKGROUND_SCRIPT] Failed to initiate tab capture for new segment:', error);
      chrome.runtime.sendMessage({
        action: 'audioCaptureError',
        error: `Failed to initiate tab capture: ${error.message}.`
      });
    }
  });
}

// 停止所有捕獲
function stopCapturing() {
  console.log('[BACKGROUND_SCRIPT] ========== STOP RECORDING INITIATED ==========');
  console.log('[BACKGROUND_SCRIPT] Stop time:', new Date().toISOString());
  console.log('[BACKGROUND_SCRIPT] Current pending API calls:', captureState.pendingApiCalls);
  console.log('[BACKGROUND_SCRIPT] Current transcript chunks:', captureState.transcriptChunks.length);
  
  // Record stop request time
  captureState.stopRequestTime = Date.now();
  captureState.stopTimeline = {
    startTime: Date.now(),
    events: []
  };
  
  // Set state flags first
  captureState.isCapturing = false; 
  // IMPORTANT: Keep accepting transcriptions for a grace period (15 seconds)
  // We'll stop accepting them after the save is complete or timeout
  captureState.lastScreenshotDataUrl = null; // Reset last screenshot so next capture doesn't skip first shot
  
  // Stop progressive save interval
  if (captureState.progressiveSaveInterval) {
    clearInterval(captureState.progressiveSaveInterval);
    captureState.progressiveSaveInterval = null;
  }
  
  // Message offscreen to stop recording
  chrome.runtime.sendMessage({
    action: 'stopOffscreenRecording',
    target: 'offscreen'
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[BACKGROUND_SCRIPT] Error sending stopOffscreenRecording message:', chrome.runtime.lastError.message);
    } else {
      console.log('[BACKGROUND_SCRIPT] stopOffscreenRecording response:', response);
    }
  });

  // Clear intervals
  if (transcribeInterval) {
    clearInterval(transcribeInterval);
    transcribeInterval = null;
  }
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
  }
  
  // Clean up local stream reference (if any was directly held, though it shouldn't be now)
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
  }
  
  console.log('[BACKGROUND_SCRIPT] stopCapturing finished. isCapturing:', captureState.isCapturing);
  console.log('[BACKGROUND_SCRIPT] Still accepting transcriptions for grace period');
  
  // Save transcript to team via popup if we have transcript chunks
  if (captureState.transcriptChunks.length > 0 && !captureState.saveScheduled) {
    captureState.saveScheduled = true;
    console.log('[BACKGROUND_SCRIPT] Scheduling transcript save to popup...');
    console.log('[BACKGROUND_SCRIPT] Will wait up to 15 seconds or until all API calls complete');
    console.log('[BACKGROUND_SCRIPT] Current pending API calls:', captureState.pendingApiCalls);
    
    // Function to save transcript
    const performSave = () => {
      // Clear the timeout if it exists
      if (captureState.saveTimeoutId) {
        clearTimeout(captureState.saveTimeoutId);
        captureState.saveTimeoutId = null;
      }
      // Create full text from transcript chunks
      const fullText = captureState.transcriptChunks
        .filter(chunk => chunk.type === 'transcription' && chunk.text)
        .map(chunk => chunk.text)
        .join(' ');
      
      console.log('[BACKGROUND_SCRIPT] 💾 PERFORMING SAVE TO TEAM');
      console.log('[BACKGROUND_SCRIPT] TeamId:', captureState.activeTeamId);
      console.log('[BACKGROUND_SCRIPT] Transcript chunks count:', captureState.transcriptChunks.length);
      console.log('[BACKGROUND_SCRIPT] Full text length:', fullText.length);
      
      // Log summary of stop timeline
      if (captureState.stopTimeline) {
        const totalElapsed = Date.now() - captureState.stopTimeline.startTime;
        console.log('[BACKGROUND_SCRIPT] ========== STOP RECORDING SUMMARY ==========');
        console.log('[BACKGROUND_SCRIPT] Total time from stop to save:', totalElapsed, 'ms');
        console.log('[BACKGROUND_SCRIPT] Timeline events:');
        captureState.stopTimeline.events.forEach(event => {
          console.log(`[BACKGROUND_SCRIPT]   - ${event.event} at ${event.elapsed}ms (pending: ${event.pendingApiCalls})${event.duration ? ` duration: ${event.duration}ms` : ''}`);
        });
        console.log('[BACKGROUND_SCRIPT] ==========================================');
      }
      
      // Send message to popup to save transcript
      chrome.runtime.sendMessage({
        action: 'saveTranscriptToTeam',
        teamId: captureState.activeTeamId,
        transcriptChunks: captureState.transcriptChunks,
        fullText: fullText
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[BACKGROUND_SCRIPT] Error sending saveTranscriptToTeam message:', chrome.runtime.lastError.message);
          // Fallback to our own save method
          saveTranscriptToTeamInBackground();
        } else {
          console.log('[BACKGROUND_SCRIPT] saveTranscriptToTeam response:', response);
          if (!response || !response.success) {
            console.warn('[BACKGROUND_SCRIPT] Popup failed to save transcript, using fallback');
            saveTranscriptToTeamInBackground();
          }
        }
      });
    };
    
    // Set a maximum timeout of 15 seconds
    captureState.saveTimeoutId = setTimeout(() => {
      const elapsedTime = Date.now() - captureState.stopTimeline.startTime;
      console.log('[BACKGROUND_SCRIPT] ⏱️ TIMEOUT: Maximum wait time (15s) reached');
      console.log('[BACKGROUND_SCRIPT] Total elapsed time:', elapsedTime, 'ms');
      console.log('[BACKGROUND_SCRIPT] Still pending API calls:', captureState.pendingApiCalls);
      captureState.stopTimeline.events.push({
        time: Date.now(),
        event: 'TIMEOUT_REACHED',
        pendingApiCalls: captureState.pendingApiCalls,
        elapsed: elapsedTime
      });
      captureState.acceptingTranscriptions = false; // Stop accepting new transcriptions
      performSave();
    }, 15000);
    
    // Check if we can save early (all API calls completed)
    if (captureState.pendingApiCalls === 0) {
      const elapsedTime = Date.now() - captureState.stopTimeline.startTime;
      console.log('[BACKGROUND_SCRIPT] ✅ No pending API calls, performing save immediately');
      console.log('[BACKGROUND_SCRIPT] Elapsed time:', elapsedTime, 'ms');
      captureState.stopTimeline.events.push({
        time: Date.now(),
        event: 'IMMEDIATE_SAVE',
        elapsed: elapsedTime
      });
      performSave();
    } else {
      console.log('[BACKGROUND_SCRIPT] ⏳ Waiting for', captureState.pendingApiCalls, 'API calls to complete...');
    }
  }
  
  chrome.runtime.sendMessage({
    action: 'captureStateChanged',
    state: {
      isCapturing: captureState.isCapturing,
      activeTeamId: captureState.activeTeamId
    }
  }).catch(err => {
    console.log('[BACKGROUND_SCRIPT] Broadcast message (captureStateChanged) - recipient may not be available:', err.message);
  });
}

// Check if we can perform early save after API call completes
function checkAndPerformEarlySave() {
  // Only perform early save if stop was requested at least 2 seconds ago
  // This gives a grace period for any in-flight API calls to complete
  const timeSinceStop = captureState.stopRequestTime ? Date.now() - captureState.stopRequestTime : 0;
  
  if (captureState.saveScheduled && captureState.pendingApiCalls === 0 && captureState.saveTimeoutId && timeSinceStop > 2000) {
    console.log('[BACKGROUND_SCRIPT] All API calls completed and grace period passed, performing early save');
    captureState.acceptingTranscriptions = false; // Stop accepting new transcriptions
    // Clear the timeout and perform save
    clearTimeout(captureState.saveTimeoutId);
    captureState.saveTimeoutId = null;
    
    // Reuse the performSave logic
    const fullText = captureState.transcriptChunks
      .filter(chunk => chunk.type === 'transcription' && chunk.text)
      .map(chunk => chunk.text)
      .join(' ');
    
    console.log('[BACKGROUND_SCRIPT] 💾 PERFORMING EARLY SAVE TO TEAM (All API calls completed)');
    console.log('[BACKGROUND_SCRIPT] TeamId:', captureState.activeTeamId);
    console.log('[BACKGROUND_SCRIPT] Transcript chunks count:', captureState.transcriptChunks.length);
    console.log('[BACKGROUND_SCRIPT] Full text length:', fullText.length);
    
    // Log summary of stop timeline
    if (captureState.stopTimeline) {
      const totalElapsed = Date.now() - captureState.stopTimeline.startTime;
      console.log('[BACKGROUND_SCRIPT] ========== STOP RECORDING SUMMARY ==========');
      console.log('[BACKGROUND_SCRIPT] Total time from stop to save:', totalElapsed, 'ms');
      console.log('[BACKGROUND_SCRIPT] Timeline events:');
      captureState.stopTimeline.events.forEach(event => {
        console.log(`[BACKGROUND_SCRIPT]   - ${event.event} at ${event.elapsed}ms (pending: ${event.pendingApiCalls})${event.duration ? ` duration: ${event.duration}ms` : ''}`);
      });
      console.log('[BACKGROUND_SCRIPT] ==========================================');
    }
    
    // Send message to popup to save transcript
    chrome.runtime.sendMessage({
      action: 'saveTranscriptToTeam',
      teamId: captureState.activeTeamId,
      transcriptChunks: captureState.transcriptChunks,
      fullText: fullText
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[BACKGROUND_SCRIPT] Error sending saveTranscriptToTeam message:', chrome.runtime.lastError.message);
        // Fallback to our own save method
        saveTranscriptToTeamInBackground();
      } else {
        console.log('[BACKGROUND_SCRIPT] saveTranscriptToTeam response:', response);
        if (!response || !response.success) {
          console.warn('[BACKGROUND_SCRIPT] Popup failed to save transcript, using fallback');
          saveTranscriptToTeamInBackground();
        }
      }
    });
  }
}

// Helper function to save audio blob to a file
function saveAudioBlobToFile(audioBlob, segmentType) {
  console.log(`[BACKGROUND_SCRIPT] saveAudioBlobToFile called. Current activeTeamId: ${captureState.activeTeamId}, segmentType: ${segmentType}`);
  
  // 檢查是否要下載檔案，如果設置為不下載則跳過
  if (!captureState.downloadFiles) {
    console.log('[BACKGROUND_SCRIPT] Download files is disabled. Skipping file save.');
    return;
  }
  
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

// 截圖捕獲函數
function captureScreenshot() {
  console.log('[BACKGROUND_SCRIPT] Starting screenshot capture');
  
  // 檢查是否還在接受新的分析結果
  if (!captureState.acceptingTranscriptions) {
    console.log('[BACKGROUND_SCRIPT] Not accepting transcriptions anymore, skipping screenshot capture');
    return;
  }
  
  // Check if screenshot analysis is enabled first
  getFromStorage('enable_screenshot_analysis').then(enableScreenshotAnalysis => {
    console.log('[BACKGROUND_SCRIPT] Screenshot analysis enabled:', enableScreenshotAnalysis !== 'false');
    
    if (enableScreenshotAnalysis === 'false') {
      console.log('[BACKGROUND_SCRIPT] Screenshot analysis disabled, skipping capture');
      return;
    }
    
    // 獲取當前活躍的標籤頁 - 使用 currentWindow: true 來確保權限正確
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs.length === 0) {
        console.error('[BACKGROUND_SCRIPT] No active tab found for screenshot');
        return;
      }
      
      const activeTab = tabs[0];
      console.log('[BACKGROUND_SCRIPT] Found active tab for screenshot:', activeTab.id, activeTab.url);
      
      // 檢查標籤頁是否可以截圖
      if (activeTab.url.startsWith('chrome://') || 
          activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('file://') ||
          activeTab.url.startsWith('about:')) {
        console.warn('[BACKGROUND_SCRIPT] Cannot capture screenshot from Chrome system pages');
        return;
      }
      
      try {
        // 首先檢查權限
        const hasActiveTabPermission = await new Promise((resolve) => {
          chrome.permissions.contains({
            permissions: ['activeTab']
          }, (result) => {
            resolve(result);
          });
        });
        
        console.log('[BACKGROUND_SCRIPT] activeTab permission check:', hasActiveTabPermission);
        
        if (!hasActiveTabPermission) {
          console.error('[BACKGROUND_SCRIPT] Missing activeTab permission for screenshot');
          return;
        }
        
        // 使用當前窗口ID進行截圖捕獲
        chrome.tabs.captureVisibleTab(activeTab.windowId, {
          format: 'jpeg', 
          quality: 85
        }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.error('[BACKGROUND_SCRIPT] Screenshot capture failed:', chrome.runtime.lastError.message);
            
            // 如果權限錯誤，嘗試發送截圖分析錯誤消息
            if (chrome.runtime.lastError.message.includes('permission')) {
              chrome.runtime.sendMessage({
                action: 'screenshotAnalysisError',
                error: 'Screenshot permission denied. Please ensure the extension has activeTab permission.'
              }).catch(err => {
                console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotAnalysisError) - recipient may not be available:', err.message);
              });
            }
            return;
          }
          
          console.log('[BACKGROUND_SCRIPT] Screenshot captured successfully');
          
          // 與前一張截圖比較
          if (captureState.lastScreenshotDataUrl === dataUrl) {
            console.log('[BACKGROUND_SCRIPT] Screenshot is identical to the previous one. Skipping analysis to save API calls.');
            // Optionally, you can still track that a duplicate was detected
            chrome.runtime.sendMessage({
              action: 'screenshotDuplicateDetected',
              timestamp: new Date().toISOString(),
              message: 'Screenshot unchanged, analysis skipped'
            }).catch(err => {
              console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotDuplicateDetected) - recipient may not be available:', err.message);
            });
            return;
          }
          
          // 更新上一張截圖的 Data URL
          console.log('[BACKGROUND_SCRIPT] New screenshot detected, updating reference and proceeding with analysis');
          captureState.lastScreenshotDataUrl = dataUrl;
          
          // 處理截圖
          processScreenshot(dataUrl);
        });
        
      } catch (permError) {
        console.error('[BACKGROUND_SCRIPT] Error checking screenshot permissions:', permError);
        chrome.runtime.sendMessage({
          action: 'screenshotAnalysisError',
          error: 'Failed to check screenshot permissions'
        }).catch(err => {
          console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotAnalysisError) - recipient may not be available:', err.message);
        });
      }
    });
  }).catch(error => {
    console.error('[BACKGROUND_SCRIPT] Error getting screenshot setting:', error);
  });
}

// 處理截圖並發送給LLM分析
function processScreenshot(screenshotDataUrl) {
  console.log('[BACKGROUND_SCRIPT] Processing screenshot');
  
  try {
    const timestamp = new Date().toISOString();
    
    // 如果啟用了下載檔案，保存截圖到本地
    if (captureState.downloadFiles) {
      saveScreenshotToFile(screenshotDataUrl, timestamp);
    }
    
    // 直接使用 analyzeScreenshotWithLLM 函數進行截圖分析
    getFromStorage('screenshot_detail_level').then(screenshotDetailLevel => {
      const detailLevel = screenshotDetailLevel || 'medium';
      console.log(`[BACKGROUND_SCRIPT] Starting screenshot analysis with detail level: ${detailLevel}`);
      analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, detailLevel);
    }).catch(error => {
      console.error('[BACKGROUND_SCRIPT] Error getting screenshot detail level setting:', error);
      // 如果無法獲取設置，使用默認的 medium 級別
      analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, 'medium');
    });
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Screenshot processing failed:', error);
    chrome.runtime.sendMessage({
      action: 'screenshotAnalysisError',
      error: `Screenshot processing failed: ${error.message}`
    }).catch(err => {
      console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotAnalysisError) - recipient may not be available:', err.message);
    });
  }
}

// 保存截圖到本地檔案
function saveScreenshotToFile(screenshotDataUrl, timestamp) {
  if (!captureState.activeTeamId) {
    console.warn('[BACKGROUND_SCRIPT] Cannot save screenshot: no active team ID');
    return;
  }
  
  const sanitizedTimestamp = timestamp.replace(/:/g, '-');
  const filename = `audio_capture/${captureState.activeTeamId}_screenshot_${sanitizedTimestamp}.jpg`;
  
  console.log(`[BACKGROUND_SCRIPT] Saving screenshot: ${filename}`);
  
  chrome.downloads.download({
    url: screenshotDataUrl,
    filename: filename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error(`[BACKGROUND_SCRIPT] Error saving screenshot:`, chrome.runtime.lastError.message);
    } else {
      console.log(`[BACKGROUND_SCRIPT] Screenshot saved successfully. Download ID: ${downloadId}`);
    }
  });
}

// 使用LLM分析截圖
function analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, detailLevel = 'medium') {
  console.log(`[BACKGROUND_SCRIPT] Analyzing screenshot with LLM (Detail Level: ${detailLevel})`);
  
  // 並行獲取所有需要的設置
  Promise.all([
    getFromStorage('openai_api_key'),
    getFromStorage('openai_api_endpoint'),
    getFromStorage('openai_screenshot_model'),
    getFromStorage('transcription_language')
  ]).then(([apiKey, apiEndpoint, screenshotModel, language]) => {
    const endpoint = apiEndpoint || 'https://api.openai.com/v1';
    const model = screenshotModel || 'gpt-4o';
    
    console.log(`[BACKGROUND_SCRIPT] Screenshot analysis settings - Model: ${model}, Endpoint: ${endpoint}, Language: ${language || 'auto'}`);
    
    if (!apiKey) {
      console.warn('[BACKGROUND_SCRIPT] No OpenAI API key found, skipping screenshot analysis');
      return;
    }
    
    // Increment pending API calls
    captureState.pendingApiCalls++;
    console.log('[BACKGROUND_SCRIPT] 📈 API CALL STARTED (Screenshot Analysis)');
    console.log('[BACKGROUND_SCRIPT] Pending API calls increased to:', captureState.pendingApiCalls);
    console.log('[BACKGROUND_SCRIPT] Detail level:', detailLevel);
    const screenshotApiStartTime = Date.now();
    
    // 根據詳細程度和語言設置不同的提示詞
    let prompt;
    const isChineseMode = language === 'zh';
    
    // Base instruction to ignore Teams UI
    const baseInstructionChinese = '這是 Microsoft Teams 的截圖。請只關注螢幕中央的共享內容，忽略所有 Teams UI 元素，如工具欄、參與者列表、聊天面板、會議控制或任何 Teams 介面按鈕。';
    const baseInstructionEnglish = 'This is a screenshot from Microsoft Teams. Please focus ONLY on the shared content in the center of the screen and ignore all Teams UI elements such as the toolbar, participant list, chat panel, meeting controls, or any Teams interface buttons.';
    const baseInstruction = isChineseMode ? baseInstructionChinese : baseInstructionEnglish;
    
    switch (detailLevel) {
      case 'low':
        prompt = isChineseMode 
          ? baseInstruction + ' 用1-2句話簡要描述主要的共享內容。'
          : baseInstruction + ' Briefly describe the main shared content in 1-2 sentences.';
        break;
      case 'high':
        prompt = isChineseMode
          ? baseInstruction + ' 提供共享內容的詳細分析，包括所有可見文字、圖表、程式碼、簡報或文件。不要提及任何 Teams 介面元素。'
          : baseInstruction + ' Provide a detailed analysis of the shared content only, including all visible text, diagrams, code, presentations, or documents being shared. Do not mention any Teams interface elements.';
        break;
      case 'medium':
      default:
        prompt = isChineseMode
          ? baseInstruction + ' 描述共享內容，重點關注關鍵資訊、可見文字、圖表或簡報。忽略邊緣的所有 Teams UI 元素。'
          : baseInstruction + ' Describe the shared content, focusing on key information, visible text, diagrams, or presentations. Ignore all Teams UI elements around the edges.';
        break;
    }
    
    // 發送請求到OpenAI API
    fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: isChineseMode 
              ? '你是一個會議助手，請用中文回答。分析截圖時要準確、簡潔。重要提醒：這些是 Teams 會議的截圖，請忽略所有 Teams UI 元素（如工具欄、參與者列表等），只專注於中央的共享內容。'
              : 'You are a meeting assistant. Analyze screenshots accurately and concisely. Important: These are Teams meeting screenshots, please ignore all Teams UI elements (toolbars, participant lists, etc.) and focus only on the shared content in the center.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: screenshotDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: detailLevel === 'high' ? 500 : (detailLevel === 'low' ? 100 : 300)
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const analysis = data.choices[0].message.content;
        console.log('[BACKGROUND_SCRIPT] Screenshot analysis completed:', analysis);
        
        // 處理分析結果
        processScreenshotAnalysis(analysis, timestamp, screenshotApiStartTime);
      } else {
        console.error('[BACKGROUND_SCRIPT] Invalid response from OpenAI API:', data);
        // Decrement pending API calls on error
        captureState.pendingApiCalls--;
        const screenshotDuration = Date.now() - screenshotApiStartTime;
        console.log('[BACKGROUND_SCRIPT] 📉 API CALL FAILED (Screenshot Analysis - Invalid Response)');
        console.log('[BACKGROUND_SCRIPT] API call duration:', screenshotDuration, 'ms');
        console.log('[BACKGROUND_SCRIPT] Pending API calls decreased to:', captureState.pendingApiCalls);
        
        if (captureState.stopTimeline) {
          captureState.stopTimeline.events.push({
            time: Date.now(),
            event: 'SCREENSHOT_API_FAILED',
            duration: screenshotDuration,
            error: 'Invalid response format',
            pendingApiCalls: captureState.pendingApiCalls,
            elapsed: Date.now() - captureState.stopTimeline.startTime
          });
        }
        
        checkAndPerformEarlySave();
      }
    })
    .catch(error => {
      console.error('[BACKGROUND_SCRIPT] Screenshot analysis failed:', error);
      // Decrement pending API calls on error
      captureState.pendingApiCalls--;
      const screenshotDuration = Date.now() - screenshotApiStartTime;
      console.log('[BACKGROUND_SCRIPT] 📉 API CALL FAILED (Screenshot Analysis - Network Error)');
      console.log('[BACKGROUND_SCRIPT] API call duration:', screenshotDuration, 'ms');
      console.log('[BACKGROUND_SCRIPT] Error:', error.message);
      console.log('[BACKGROUND_SCRIPT] Pending API calls decreased to:', captureState.pendingApiCalls);
      
      if (captureState.stopTimeline) {
        captureState.stopTimeline.events.push({
          time: Date.now(),
          event: 'SCREENSHOT_API_FAILED',
          duration: screenshotDuration,
          error: error.message,
          pendingApiCalls: captureState.pendingApiCalls,
          elapsed: Date.now() - captureState.stopTimeline.startTime
        });
      }
      
      checkAndPerformEarlySave();
    });
    
  }).catch(error => {
    console.error('[BACKGROUND_SCRIPT] Error getting screenshot analysis settings:', error);
  });
}

// 處理截圖分析結果
function processScreenshotAnalysis(analysis, timestamp, apiStartTime) {
  console.log('[BACKGROUND_SCRIPT] Processing screenshot analysis result');
  
  // 檢查是否還在接受新的分析結果
  if (!captureState.acceptingTranscriptions) {
    console.log('[BACKGROUND_SCRIPT] Not accepting transcriptions anymore, skipping screenshot analysis processing');
    return;
  }
  
  // 創建分析結果對象
  const analysisResult = {
    type: 'screenshot_analysis',
    timestamp: timestamp,
    analysis: analysis,
    teamId: captureState.activeTeamId
  };
  
  // 將分析結果添加到轉錄片段中
  captureState.transcriptChunks.push(analysisResult);
  console.log('[BACKGROUND_SCRIPT] Screenshot analysis added to transcript chunks. Total chunks:', captureState.transcriptChunks.length);
  
  // 通知所有打開的 extension 頁面更新
  chrome.runtime.sendMessage({
    action: 'transcriptUpdated',
    transcriptChunks: captureState.transcriptChunks
  }).catch(err => {
    console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptUpdated) - recipient may not be available:', err.message);
  });
  
  // Decrement pending API calls after successful processing
  captureState.pendingApiCalls--;
  const screenshotDuration = apiStartTime ? Date.now() - apiStartTime : 0;
  console.log('[BACKGROUND_SCRIPT] 📉 API CALL COMPLETED (Screenshot Analysis)');
  console.log('[BACKGROUND_SCRIPT] API call duration:', screenshotDuration, 'ms');
  console.log('[BACKGROUND_SCRIPT] Pending API calls decreased to:', captureState.pendingApiCalls);
  
  if (captureState.stopTimeline) {
    captureState.stopTimeline.events.push({
      time: Date.now(),
      event: 'SCREENSHOT_API_COMPLETED',
      duration: screenshotDuration,
      pendingApiCalls: captureState.pendingApiCalls,
      elapsed: Date.now() - captureState.stopTimeline.startTime
    });
  }
  
  // Check if we can perform early save
  checkAndPerformEarlySave();
}

// 處理音頻片段的轉錄
async function processAudioChunkInBackground(audioData, timestamp, isFinal = false) {
  console.log('[BACKGROUND_SCRIPT] Processing audio chunk in background');
  
  // 檢查是否還在接受新的轉錄結果
  if (!captureState.acceptingTranscriptions) {
    console.log('[BACKGROUND_SCRIPT] Not accepting transcriptions anymore, skipping audio processing');
    return;
  }
  
  try {
    // 將base64音頻數據轉換為Blob
    const audioBlob = base64ToBlob(audioData, 'audio/webm');
    console.log('[BACKGROUND_SCRIPT] Audio blob created, size:', audioBlob.size);
    
    // 如果啟用了下載檔案，保存音頻檔案
    if (captureState.downloadFiles) {
      const segmentType = isFinal ? 'final' : `segment_${captureState.segmentNumber}`;
      saveAudioBlobToFile(audioBlob, segmentType);
    }
    
    // 獲取轉錄設置
    const transcriptionSettings = await Promise.all([
      getFromStorage('openai_api_key'),
      getFromStorage('openai_api_endpoint'),
      getFromStorage('openai_stt_api_endpoint'),
      getFromStorage('openai_stt_api_key'),
      getFromStorage('openai_transcription_model'),
      getFromStorage('transcription_language')
    ]);
    
    const [apiKey, apiEndpoint, sttApiEndpoint, sttApiKey, transcriptionModel, language] = transcriptionSettings;
    // Use STT-specific endpoint if available, otherwise fallback to main endpoint
    const endpoint = sttApiEndpoint || apiEndpoint || 'https://api.openai.com/v1';
    // Use STT-specific API key if available, otherwise fallback to main API key
    const effectiveApiKey = sttApiKey || apiKey;
    const model = transcriptionModel || 'whisper-1';
    
    if (!effectiveApiKey) {
      console.warn('[BACKGROUND_SCRIPT] No API key found for transcription (neither main nor STT-specific), skipping transcription');
      return;
    }
    
    console.log(`[BACKGROUND_SCRIPT] Transcription settings - Model: ${model}, Endpoint: ${endpoint}${sttApiEndpoint ? ' (STT-specific)' : ''}, API Key: ${sttApiKey ? 'STT-specific' : 'Main'}, Language: ${language || 'auto'}`);
    
    // Log if using Groq
    if (endpoint.includes('groq.com')) {
      console.log('[BACKGROUND_SCRIPT] Detected Groq API endpoint - using Whisper model:', model);
    }
    
    // Increment pending API calls
    captureState.pendingApiCalls++;
    console.log('[BACKGROUND_SCRIPT] 📈 API CALL STARTED (Audio Transcription)');
    console.log('[BACKGROUND_SCRIPT] Pending API calls increased to:', captureState.pendingApiCalls);
    console.log('[BACKGROUND_SCRIPT] Audio size:', audioBlob.size, 'bytes');
    const apiCallStartTime = Date.now();
    
    // 創建FormData進行轉錄
    const formData = new FormData();
    // Groq may have issues with .webm extension, try .m4a or generic name
    const filename = endpoint.includes('groq.com') ? 'audio.m4a' : 'audio.webm';
    formData.append('file', audioBlob, filename);
    formData.append('model', model);
    // 只有在有指定語言時才添加language參數，空字串表示自動檢測
    if (language && language.trim() !== '') {
      formData.append('language', language);
    }
    // Add response_format for better compatibility with Groq and other providers
    // Groq supports 'json' and 'verbose_json'
    formData.append('response_format', 'json');
    
    console.log('[BACKGROUND_SCRIPT] Sending audio transcription request:', {
      endpoint: `${endpoint}/audio/transcriptions`,
      model: model,
      audioSize: audioBlob.size,
      audioType: audioBlob.type,
      filename: filename,
      language: language || 'auto-detect',
      timestamp: new Date().toISOString(),
      isFinal: isFinal
    });
    
    // 發送轉錄請求
    const response = await fetch(`${endpoint}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${effectiveApiKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      // Try to get error details from response
      let errorDetails = `${response.status} ${response.statusText}`;
      try {
        const errorBody = await response.json();
        console.error('[BACKGROUND_SCRIPT] API Error Response:', errorBody);
        if (errorBody.error) {
          errorDetails = errorBody.error.message || errorBody.error;
        }
      } catch (e) {
        // If we can't parse the error response, use the default
      }
      throw new Error(`Transcription API request failed: ${errorDetails}`);
    }
    
    const transcriptionResult = await response.json();
    
    // Handle both OpenAI and Groq response formats
    let transcriptionText = '';
    if (transcriptionResult.text) {
      transcriptionText = transcriptionResult.text;
    } else if (transcriptionResult.segments && Array.isArray(transcriptionResult.segments)) {
      // Groq verbose_json format
      transcriptionText = transcriptionResult.segments.map(seg => seg.text).join(' ');
    }
    
    console.log('[BACKGROUND_SCRIPT] Audio transcription successful:', {
      model: model,
      textLength: transcriptionText.length,
      textPreview: transcriptionText.substring(0, 100) + '...',
      hasSegments: !!transcriptionResult.segments,
      segmentCount: transcriptionResult.segments?.length || 0,
      timestamp: new Date().toISOString(),
      isFinal: isFinal
    });
    
    if (transcriptionText && transcriptionText.trim()) {
      // 創建轉錄結果對象
      const transcriptChunk = {
        type: 'transcription',
        timestamp: timestamp,
        text: transcriptionText.trim(),
        teamId: captureState.activeTeamId,
        isFinal: isFinal
      };
      
      // 將轉錄結果添加到片段中
      captureState.transcriptChunks.push(transcriptChunk);
      console.log('[BACKGROUND_SCRIPT] Transcription added to transcript chunks. Total chunks:', captureState.transcriptChunks.length);
      
      // 通知所有打開的 extension 頁面更新
      chrome.runtime.sendMessage({
        action: 'transcriptUpdated',
        transcriptChunks: captureState.transcriptChunks
      }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptUpdated) - recipient may not be available:', err.message);
      });
    } else {
      console.log('[BACKGROUND_SCRIPT] No transcription text received or text is empty');
    }
    
    // Decrement pending API calls
    captureState.pendingApiCalls--;
    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log('[BACKGROUND_SCRIPT] 📉 API CALL COMPLETED (Audio Transcription)');
    console.log('[BACKGROUND_SCRIPT] API call duration:', apiCallDuration, 'ms');
    console.log('[BACKGROUND_SCRIPT] Pending API calls decreased to:', captureState.pendingApiCalls);
    
    if (captureState.stopTimeline) {
      captureState.stopTimeline.events.push({
        time: Date.now(),
        event: 'AUDIO_API_COMPLETED',
        duration: apiCallDuration,
        pendingApiCalls: captureState.pendingApiCalls,
        elapsed: Date.now() - captureState.stopTimeline.startTime
      });
    }
    
    // Check if we can perform early save
    checkAndPerformEarlySave();
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Audio processing failed:', error);
    
    // Decrement pending API calls even on error
    captureState.pendingApiCalls--;
    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log('[BACKGROUND_SCRIPT] 📉 API CALL FAILED (Audio Transcription)');
    console.log('[BACKGROUND_SCRIPT] API call duration before error:', apiCallDuration, 'ms');
    console.log('[BACKGROUND_SCRIPT] Error:', error.message);
    console.log('[BACKGROUND_SCRIPT] Pending API calls decreased to:', captureState.pendingApiCalls);
    
    if (captureState.stopTimeline) {
      captureState.stopTimeline.events.push({
        time: Date.now(),
        event: 'AUDIO_API_FAILED',
        duration: apiCallDuration,
        error: error.message,
        pendingApiCalls: captureState.pendingApiCalls,
        elapsed: Date.now() - captureState.stopTimeline.startTime
      });
    }
    
    // Check if we can perform early save
    checkAndPerformEarlySave();
  }
}

// 將base64字符串轉換為Blob
function base64ToBlob(base64Data, mimeType) {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

// 保存轉錄結果到團隊數據 (fallback method compatible with popup's localStorage)
async function saveTranscriptToTeamInBackground() {
  console.log('[BACKGROUND_SCRIPT] Saving transcript to team in background (fallback)');
  
  if (!captureState.activeTeamId || captureState.transcriptChunks.length === 0) {
    console.log('[BACKGROUND_SCRIPT] No active team or no transcript chunks to save');
    return false;
  }
  
  try {
    // Generate full text from chunks
    const fullText = captureState.transcriptChunks
      .filter(chunk => chunk.type === 'transcription' && chunk.text)
      .map(chunk => chunk.text)
      .join(' ');
    
    // Create transcript record in the same format as popup
    const newTranscript = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      text: fullText,
      chunks: JSON.parse(JSON.stringify(captureState.transcriptChunks)) // Deep copy
    };
    
    // Save to chrome.storage.sync with special key that popup can check
    const fallbackData = {
      teamId: captureState.activeTeamId,
      transcript: newTranscript,
      timestamp: Date.now()
    };
    
    // First, get existing fallback saves
    const existingFallback = await getFromStorage('pending_transcript_saves') || [];
    existingFallback.push(fallbackData);
    
    // Keep only the last 10 fallback saves
    if (existingFallback.length > 10) {
      existingFallback.splice(0, existingFallback.length - 10);
    }
    
    await setToStorage('pending_transcript_saves', existingFallback);
    console.log('[BACKGROUND_SCRIPT] Transcript saved to fallback storage successfully');
    console.log('[BACKGROUND_SCRIPT] Fallback save details:', {
      teamId: captureState.activeTeamId,
      transcriptLength: fullText.length,
      chunksCount: captureState.transcriptChunks.length
    });
    
    // Also save a flag to indicate there are pending saves
    await setToStorage('has_pending_saves', true);
    
    // Notify any open popups to check for pending saves
    chrome.runtime.sendMessage({
      action: 'checkPendingSaves',
      message: 'Background saved transcript to fallback storage'
    }).catch(err => {
      console.log('[BACKGROUND_SCRIPT] Broadcast message (checkPendingSaves) - recipient may not be available:', err.message);
    });
    
    return true;
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Failed to save transcript to fallback:', error);
    return false;
  }
}

// 輔助函數：從存儲中獲取值
function getFromStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        console.error(`[BACKGROUND_SCRIPT] Error getting ${key} from storage:`, chrome.runtime.lastError);
        resolve(null);
      } else {
        resolve(result[key]);
      }
    });
  });
}

// 輔助函數：設置存儲值
function setToStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        console.error(`[BACKGROUND_SCRIPT] Error setting ${key} to storage:`, chrome.runtime.lastError);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// 輔助函數：將dataURL轉換為Blob
function dataURLToBlob(dataURL) {
  return new Promise((resolve, reject) => {
    try {
      const arr = dataURL.split(',');
      const mime = arr[0].match(/:(.*?);/)[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      
      resolve(new Blob([u8arr], { type: mime }));
    } catch (error) {
      reject(error);
    }
  });
}

// Start progressive save interval
function startProgressiveSave() {
  console.log('[BACKGROUND_SCRIPT] Starting progressive save interval (every 30 seconds)');
  
  // Clear any existing interval
  if (captureState.progressiveSaveInterval) {
    clearInterval(captureState.progressiveSaveInterval);
  }
  
  // Save every 30 seconds
  captureState.progressiveSaveInterval = setInterval(() => {
    if (captureState.isCapturing && captureState.transcriptChunks.length > 0) {
      console.log('[BACKGROUND_SCRIPT] Progressive save triggered');
      performProgressiveSave();
    }
  }, 30000); // 30 seconds
}

// Perform progressive save
function performProgressiveSave() {
  console.log('[BACKGROUND_SCRIPT] Performing progressive save');
  console.log('[BACKGROUND_SCRIPT] Current chunks:', captureState.transcriptChunks.length);
  console.log('[BACKGROUND_SCRIPT] Team ID:', captureState.activeTeamId);
  
  if (!captureState.activeTeamId || captureState.transcriptChunks.length === 0) {
    console.log('[BACKGROUND_SCRIPT] Skipping progressive save - no team or no chunks');
    return;
  }
  
  // Create full text from transcript chunks
  const fullText = captureState.transcriptChunks
    .filter(chunk => chunk.type === 'transcription' && chunk.text)
    .map(chunk => chunk.text)
    .join(' ');
  
  // Send message to popup to save transcript progressively
  chrome.runtime.sendMessage({
    action: 'progressiveSaveTranscript',
    teamId: captureState.activeTeamId,
    transcriptChunks: captureState.transcriptChunks,
    fullText: fullText,
    isProgressive: true
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[BACKGROUND_SCRIPT] Error sending progressiveSaveTranscript message:', chrome.runtime.lastError.message);
      // Fallback to background save
      saveProgressiveTranscriptInBackground();
    } else {
      console.log('[BACKGROUND_SCRIPT] progressiveSaveTranscript response:', response);
      if (!response || !response.success) {
        console.warn('[BACKGROUND_SCRIPT] Popup failed to save progressive transcript, using fallback');
        saveProgressiveTranscriptInBackground();
      } else {
        captureState.lastProgressiveSaveTime = Date.now();
      }
    }
  });
}

// Save progressive transcript in background
async function saveProgressiveTranscriptInBackground() {
  console.log('[BACKGROUND_SCRIPT] Saving progressive transcript in background');
  
  try {
    // Save to a special key for progressive saves
    const progressiveData = {
      teamId: captureState.activeTeamId,
      transcriptChunks: JSON.parse(JSON.stringify(captureState.transcriptChunks)),
      timestamp: Date.now(),
      isProgressive: true
    };
    
    await setToStorage('progressive_transcript_save', progressiveData);
    captureState.lastProgressiveSaveTime = Date.now();
    console.log('[BACKGROUND_SCRIPT] Progressive transcript saved to storage');
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Failed to save progressive transcript:', error);
  }
}

console.log('[BACKGROUND_SCRIPT] background.js script loaded completely');
