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
  saveScheduled: false // 新增：防止重複保存的標誌
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

// 初始化監聽器
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Hackathon Judge 擴展已安裝');
  console.log('[BACKGROUND_SCRIPT] onInstalled listener triggered');
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
        console.log(`[BACKGROUND_SCRIPT] Download files set to: ${captureState.downloadFiles}`);
        console.log('[BACKGROUND_SCRIPT] captureState after updates in startCapture:', JSON.stringify(captureState));
        
        // Start the first segment capture - this will also set the recordingActiveTab value
        captureNewSegment();
        
        // Set interval to capture new segments every 10 seconds
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
        }, 10000);
        
        // Set interval to capture screenshots every 10 seconds
        screenshotInterval = setInterval(() => {
          if (captureState.isCapturing) {
            // Check if screenshot analysis is enabled
            getFromStorage('enable_screenshot_analysis').then(enableScreenshotAnalysis => {
              if (enableScreenshotAnalysis !== 'false') {
                captureScreenshot();
              }
            });
          }
        }, 10000);
        
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
        captureScreenshot().then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('[BACKGROUND_SCRIPT] Test screenshot failed:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // Required for async response
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
  console.log('[BACKGROUND_SCRIPT] stopCapturing called.');
  
  // Set state flags first
  captureState.isCapturing = false; 
  captureState.acceptingTranscriptions = false;
  
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
  
  if (captureState.transcriptChunks.length > 0 && !captureState.saveScheduled) {
    captureState.saveScheduled = true;
    setTimeout(() => saveTranscriptToTeamInBackground(), 5000);
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
    
    // 獲取當前活躍的標籤頁
    chrome.tabs.query({active: true}, (tabs) => {
      if (tabs.length === 0) {
        console.error('[BACKGROUND_SCRIPT] No active tab found for screenshot');
        return;
      }
      
      const activeTab = tabs[0];
      console.log('[BACKGROUND_SCRIPT] Found active tab for screenshot:', activeTab.id, activeTab.url);
      
      // 捕獲可見標籤頁的截圖
      chrome.tabs.captureVisibleTab(activeTab.windowId, {format: 'jpeg', quality: 85}, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error('[BACKGROUND_SCRIPT] Screenshot capture failed:', chrome.runtime.lastError.message);
          return;
        }
        
        console.log('[BACKGROUND_SCRIPT] Screenshot captured successfully');
        
        // 與前一張截圖比較
        if (captureState.lastScreenshotDataUrl === dataUrl) {
          console.log('[BACKGROUND_SCRIPT] Screenshot is identical to the previous one. Skipping analysis.');
          return;
        }
        
        // 更新上一張截圖的 Data URL
        captureState.lastScreenshotDataUrl = dataUrl;
        
        // 處理截圖
        processScreenshot(dataUrl);
      });
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
    
    // 從localStorage獲取截圖分析詳細程度設置
    getFromStorage('screenshot_detail_level').then(screenshotDetailLevel => {
      const detailLevel = screenshotDetailLevel || 'medium'; // Default to medium
      
      // 發送截圖給LLM進行分析
      analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, detailLevel);
    }).catch(error => {
      console.error('[BACKGROUND_SCRIPT] Error getting screenshot detail level:', error);
      // Use default if error
      analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, 'medium');
    });
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Screenshot processing failed:', error);
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
    getFromStorage('openai_screenshot_model')
  ]).then(([apiKey, apiEndpoint, screenshotModel]) => {
    const endpoint = apiEndpoint || 'https://api.openai.com/v1';
    const model = screenshotModel || 'gpt-4o';
    
    console.log(`[BACKGROUND_SCRIPT] Screenshot analysis settings - Model: ${model}, Endpoint: ${endpoint}`);
    
    if (!apiKey) {
      console.error('[BACKGROUND_SCRIPT] No API key found for screenshot analysis');
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: 'No API key configured for screenshot analysis'
      });
      return;
    }
    
    if (!model) {
      console.error('[BACKGROUND_SCRIPT] No screenshot model selected');
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: 'No screenshot model selected in settings'
      });
      return;
    }
    
    // 準備API請求
    const baseApiUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    
    let promptText = "Please analyze this screenshot from a Teams meeting or presentation. Provide a concise summary of what you see, including any visible text, UI elements, presentation content, or meeting activities. Focus on information that would be relevant for meeting notes or evaluation purposes.";

    if (detailLevel === 'low') {
      promptText = "Provide a very brief, one-sentence summary of this screenshot, focusing on the main subject.";
    } else if (detailLevel === 'high') {
      promptText = "Provide a highly detailed and comprehensive analysis of this screenshot. Describe all visible text, UI elements, buttons, icons, presentation content (including titles, bullet points, images, charts, graphs), any people visible, and infer the current meeting activity or context. Be as exhaustive as possible.";
    }
    
    const requestBody = {
      model: model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText
            },
            {
              type: "image_url",
              image_url: {
                url: screenshotDataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500
    };
    
    fetch(`${baseApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }).then(response => {
      if (!response.ok) {
        return response.text().then(errorText => {
          console.error('[BACKGROUND_SCRIPT] Screenshot analysis API error:', response.status, errorText);
          chrome.runtime.sendMessage({
            action: 'screenshotAnalysisError',
            error: `API error: ${response.status} - ${errorText}`
          });
        });
      }
      
      return response.json().then(result => {
        const analysis = result.choices?.[0]?.message?.content;
        
        if (analysis) {
          console.log('[BACKGROUND_SCRIPT] Screenshot analysis completed:', analysis);
          
          // 再次檢查是否還應該接受分析結果
          if (!captureState.acceptingTranscriptions) {
            console.log('[BACKGROUND_SCRIPT] Recording stopped during screenshot analysis, ignoring result:', analysis);
            return;
          }
          
          // 創建截圖分析記錄
          const screenshotAnalysis = {
            timestamp: timestamp,
            analysis: analysis,
            type: 'screenshot'
          };
          
          // 保存到轉錄片段中（作為特殊類型的記錄）
          captureState.transcriptChunks.push(screenshotAnalysis);
          
          // 通知popup更新
          chrome.runtime.sendMessage({
            action: 'screenshotAnalyzed',
            data: screenshotAnalysis
          }).catch(err => {
            console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotAnalyzed) - recipient may not be available:', err.message);
          });
          
          console.log('[BACKGROUND_SCRIPT] Screenshot analysis saved and notification sent');
        } else {
          console.warn('[BACKGROUND_SCRIPT] No analysis content received from LLM');
          chrome.runtime.sendMessage({
            action: 'screenshotAnalysisError',
            error: 'No analysis content received from AI model'
          });
        }
      });
    }).catch(error => {
      console.error('[BACKGROUND_SCRIPT] Screenshot analysis failed:', error);
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: `Screenshot analysis failed: ${error.message}`
      });
    });
  }).catch(error => {
    console.error('[BACKGROUND_SCRIPT] Error getting screenshot analysis settings:', error);
    chrome.runtime.sendMessage({
      action: 'screenshotAnalysisError',
      error: `Failed to get settings: ${error.message}`
    }).catch(err => {
      console.log('[BACKGROUND_SCRIPT] Broadcast message (screenshotAnalysisError) - recipient may not be available:', err.message);
    });
  });
}

// 輔助函數：從localStorage獲取數據
function getFromStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        console.error(`[BACKGROUND_SCRIPT] chrome.storage.local error for key '${key}':`, chrome.runtime.lastError);
        resolve(null);
      } else {
        const value = result[key];
        console.log(`[BACKGROUND_SCRIPT] getFromStorage('${key}'):`, value ? 'Found' : 'Not found');
        resolve(value);
      }
    });
  });
}

// 在背景處理音頻轉文字
function processAudioChunkInBackground(audioBase64, timestamp, isFinal) {
  console.log('[BACKGROUND_SCRIPT] Processing audio chunk in background:', timestamp);
  console.log('[BACKGROUND_SCRIPT] Is final chunk:', isFinal ? 'Yes' : 'No');
  console.log('[BACKGROUND_SCRIPT] acceptingTranscriptions:', captureState.acceptingTranscriptions);
  
  // 檢查是否還應該接受轉錄結果
  if (!captureState.acceptingTranscriptions) {
    console.log('[BACKGROUND_SCRIPT] Not accepting transcriptions anymore, ignoring audio chunk from:', timestamp);
    return;
  }
  
  // 並行獲取API設置
  Promise.all([
    getFromStorage('openai_api_key'),
    getFromStorage('openai_api_endpoint'),
    getFromStorage('transcription_language')
  ]).then(([apiKey, apiEndpoint, selectedLanguage]) => {
    const endpoint = apiEndpoint || 'https://api.openai.com/v1';
    const language = selectedLanguage || '';
    
    if (!apiKey) {
      console.error('[BACKGROUND_SCRIPT] No API key found for transcription');
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: 'No OpenAI API key configured'
      }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
      });
      return;
    }
    
    // 建立音訊檔案
    const audioBlob = base64ToBlob(audioBase64, 'audio/webm');
    
    if (audioBlob.size < 100) {
      console.error('[BACKGROUND_SCRIPT] Audio blob is too small, likely contains no audio data');
      return;
    }
    
    // 確保 API 端點不以斜槓結尾
    const baseApiUrl = endpoint.endsWith('/') ? endpoint.slice(0, -1) : endpoint;
    console.log(`[BACKGROUND_SCRIPT] Using API endpoint for transcription: ${baseApiUrl}`);
    
    // 建立FormData
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    // 添加語言參數（如果用戶有選擇的話）
    if (language) {
      formData.append('language', language);
      console.log(`[BACKGROUND_SCRIPT] Using language: ${language}`);
    } else {
      console.log('[BACKGROUND_SCRIPT] Using auto-detect language');
    }
    
    // 調用API進行轉錄
    fetch(`${baseApiUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    }).then(response => {
      if (!response.ok) {
        return response.text().then(errorText => {
          console.error('[BACKGROUND_SCRIPT] Transcription API error:', response.status, errorText);
          chrome.runtime.sendMessage({
            action: 'transcriptionError',
            error: `API error: ${response.status} - ${errorText}`
          }).catch(err => {
            console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
          });
        });
      }
      
      return response.json().then(result => {
        // Check if transcription has content
        if (!result.text || result.text.trim() === '') {
          console.warn('[BACKGROUND_SCRIPT] Transcription returned empty text');
          return;
        }
        
        // 再次檢查是否還應該接受轉錄結果（防止在API請求期間停止了錄音）
        if (!captureState.acceptingTranscriptions) {
          console.log('[BACKGROUND_SCRIPT] Recording stopped during API request, ignoring transcription result:', result.text);
          return;
        }
        
        // 保存轉錄結果
        const transcriptChunk = {
          timestamp: timestamp,
          text: result.text,
          isFinal: isFinal || false
        };
        
        // 保存到 background state
        captureState.transcriptChunks.push(transcriptChunk);
        console.log('[BACKGROUND_SCRIPT] Transcription completed and saved:', result.text);
        
        // 通知所有打開的 extension 頁面更新
        chrome.runtime.sendMessage({
          action: 'transcriptUpdated',
          transcriptChunks: captureState.transcriptChunks
        }).catch(err => {
          // Ignore errors for broadcast messages (no specific recipient)
          console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptUpdated) - recipient may not be available:', err.message);
        });
        
        // 移除isFinal的自動保存邏輯，讓stopCapturing統一處理保存
        // 這樣可以防止重複保存的問題
        if (isFinal) {
          console.log('[BACKGROUND_SCRIPT] Final chunk received, but save will be handled by stopCapturing to prevent duplicates');
        }
      });
    }).catch(error => {
      console.error('[BACKGROUND_SCRIPT] Audio processing failed:', error);
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: `Audio processing failed: ${error.message}`
      }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
      });
    });
  }).catch(error => {
    console.error('[BACKGROUND_SCRIPT] Error getting transcription settings:', error);
    chrome.runtime.sendMessage({
      action: 'transcriptionError',
      error: `Failed to get settings: ${error.message}`
    }).catch(err => {
      console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
    });
  });
}

// base64轉Blob (在background中使用)
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  return new Blob(byteArrays, { type: mimeType });
}

// 在背景中保存轉錄到團隊記錄
function saveTranscriptToTeamInBackground() {
  try {
    console.log('[BACKGROUND_SCRIPT] saveTranscriptToTeamInBackground - Starting to save transcript');
    console.log('[BACKGROUND_SCRIPT] Active team ID:', captureState.activeTeamId);
    console.log('[BACKGROUND_SCRIPT] Transcript chunks length:', captureState.transcriptChunks.length);
    console.log('[BACKGROUND_SCRIPT] Transcript chunks:', JSON.stringify(captureState.transcriptChunks, null, 2));
    
    if (!captureState.activeTeamId) {
      console.warn('[BACKGROUND_SCRIPT] Cannot save transcript: no active team ID');
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: 'Cannot save transcript: no active team selected'
      }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
      });
      return false;
    }
    
    if (captureState.transcriptChunks.length === 0) {
      console.warn('[BACKGROUND_SCRIPT] Cannot save transcript: empty chunks');
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: 'Cannot save transcript: no transcription data available'
      }).catch(err => {
        console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
      });
      return false;
    }
    
    const fullText = captureState.transcriptChunks.map(chunk => {
      if (chunk.type === 'screenshot') {
        return `[📸 ${chunk.analysis}]`;
      }
      return chunk.text || chunk.analysis || '';
    }).join(' ');
    
    console.log('[BACKGROUND_SCRIPT] Full text to save:', fullText);
    
    // 通知前端保存轉錄記錄
    const messageToSend = {
      action: 'saveTranscriptToTeam',
      teamId: captureState.activeTeamId,
      transcriptChunks: captureState.transcriptChunks,
      fullText: fullText
    };
    
    console.log('[BACKGROUND_SCRIPT] Sending message to popup:', JSON.stringify(messageToSend, null, 2));
    
    chrome.runtime.sendMessage(messageToSend, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[BACKGROUND_SCRIPT] Error sending save message:', chrome.runtime.lastError);
      } else {
        console.log('[BACKGROUND_SCRIPT] Save message sent successfully, response:', response);
      }
      // 重置保存標誌，準備下一次錄音
      captureState.saveScheduled = false;
      console.log('[BACKGROUND_SCRIPT] Reset saveScheduled flag after save attempt');
    });
    
    console.log('[BACKGROUND_SCRIPT] Transcript save request sent to frontend');
    return true;
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] saveTranscriptToTeamInBackground error:', error);
    chrome.runtime.sendMessage({
      action: 'transcriptionError',
      error: `Failed to save transcript: ${error.message}`
    }).catch(err => {
      console.log('[BACKGROUND_SCRIPT] Broadcast message (transcriptionError) - recipient may not be available:', err.message);
    });
    return false;
  }
}