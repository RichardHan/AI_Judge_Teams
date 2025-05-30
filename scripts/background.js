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
  lastScreenshotDataUrl: null
};

// 錄音相關
let captureStream = null;
let mediaRecorder = null;
let audioChunks = [];
let transcribeInterval = null;
let screenshotInterval = null; // 截圖間隔計時器
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
      console.log('[BACKGROUND_SCRIPT] Action: getCaptureState. Current captureState:', JSON.stringify(captureState));
      sendResponse({
        isCapturing: captureState.isCapturing,
        activeTeamId: captureState.activeTeamId,
        transcriptChunks: captureState.transcriptChunks
      });
      break;
      
    case 'startCapture':
      console.log('[BACKGROUND_SCRIPT] Action: startCapture. Received options:', JSON.stringify(message.options));
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
            if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== 'function') {
              console.error('[BACKGROUND_SCRIPT] Extension appears to be disabled during recording. Stopping audio capture.');
              chrome.runtime.sendMessage({
                action: 'extensionDisabled',
                error: 'Extension became disabled during recording. Audio transcription stopped.'
              });
              // 清除音频相关的间隔，但保留截图功能
              if (transcribeInterval) {
                clearInterval(transcribeInterval);
                transcribeInterval = null;
              }
              return;
            }
            
            // Stop current recording if it exists
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              console.log('[BACKGROUND_SCRIPT] Stopping current segment recording to start a new one');
              mediaRecorder.stop();
              
              // Start a new capture immediately to reduce delay
              // This will create overlap rather than gaps
              captureNewSegment();
            } else {
              // If there's no active recording for some reason, start one
              captureNewSegment();
            }
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
        return true; // Will respond asynchronously
      } catch (error) {
        console.error('[BACKGROUND_SCRIPT] testScreenshot error:', error);
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
  
  // 检查扩展是否具有必要的权限和功能
  if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== 'function') {
    console.error('[BACKGROUND_SCRIPT] Extension appears to be disabled or tabCapture API is not available');
    // 通知用户扩展可能已被禁用
    chrome.runtime.sendMessage({
      action: 'extensionDisabled',
      error: 'Chrome extension appears to be disabled. Audio transcription will not work.'
    });
    return;
  }
  
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
        // 通知用户音频捕获失败
        chrome.runtime.sendMessage({
          action: 'audioCaptureError',
          error: 'Failed to capture audio. Please check if the extension is enabled and has proper permissions.'
        });
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
      
      // 創建音頻上下文來重新路由音頻到揚聲器
      try {
        // Basic audio rerouting - always enabled for now to fix the core issue
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        
        // 將音頻同時連接到揚聲器（用於播放）和保持原始流（用於錄製）
        source.connect(audioContext.destination); // 這會將音頻輸出到揚聲器
        
        console.log('[BACKGROUND_SCRIPT] Audio rerouting to speakers successful');
        
        // 通知用戶音頻已重新路由
        chrome.runtime.sendMessage({
          action: 'audioReroutingSuccess',
          message: 'Audio is now being captured and played through speakers simultaneously'
        });
      } catch (audioError) {
        console.warn('[BACKGROUND_SCRIPT] Audio rerouting setup failed:', audioError);
        // 如果音頻重新路由失敗，仍然繼續錄製，但通知用戶
        chrome.runtime.sendMessage({
          action: 'audioReroutingWarning',
          message: 'Audio capture working but tab audio may be muted. This is normal.'
        });
      }
      
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
            console.log(`[BACKGROUND_SCRIPT] isFinal flag set to: ${isFinal}`);
            
            // Process audio chunk in background instead of sending to popup
            processAudioChunkInBackground(base64data, new Date().toISOString(), isFinal);
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
  
  if (screenshotInterval) {
    clearInterval(screenshotInterval);
    screenshotInterval = null;
    console.log('[BACKGROUND_SCRIPT] Screenshot interval cleared.');
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
      isCapturing: captureState.isCapturing,
      activeTeamId: captureState.activeTeamId
    }
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
  
  try {
    // Check if screenshot analysis is enabled first
    const enableScreenshotAnalysis = await getFromStorage('enable_screenshot_analysis');
    console.log('[BACKGROUND_SCRIPT] Screenshot analysis enabled:', enableScreenshotAnalysis !== 'false');
    
    if (enableScreenshotAnalysis === 'false') {
      console.log('[BACKGROUND_SCRIPT] Screenshot analysis disabled, skipping capture');
      return;
    }
    
    // 獲取當前活躍的標籤頁
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({active: true, currentWindow: true}, resolve);
    });
    
    if (tabs.length === 0) {
      console.error('[BACKGROUND_SCRIPT] No active tab found for screenshot');
      return;
    }
    
    const activeTab = tabs[0];
    
    // 捕獲可見標籤頁的截圖
    const screenshotDataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(activeTab.windowId, {format: 'jpeg', quality: 85}, (dataUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(dataUrl);
        }
      });
    });
    
    console.log('[BACKGROUND_SCRIPT] Screenshot captured successfully');
    
    // 與前一張截圖比較
    if (captureState.lastScreenshotDataUrl === screenshotDataUrl) {
      console.log('[BACKGROUND_SCRIPT] Screenshot is identical to the previous one. Skipping analysis.');
      // Optionally, still save the timestamp or a placeholder to indicate a frame was captured but not analyzed
      // For now, we just skip.
      return;
    }
    
    // 更新上一張截圖的 Data URL
    captureState.lastScreenshotDataUrl = screenshotDataUrl;
    
    // 處理截圖
    await processScreenshot(screenshotDataUrl);
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Screenshot capture failed:', error);
  }
}

// 處理截圖並發送給LLM分析
async function processScreenshot(screenshotDataUrl) {
  console.log('[BACKGROUND_SCRIPT] Processing screenshot');
  
  try {
    const timestamp = new Date().toISOString();
    
    // 如果啟用了下載檔案，保存截圖到本地
    if (captureState.downloadFiles) {
      saveScreenshotToFile(screenshotDataUrl, timestamp);
    }
    
    // 從localStorage獲取截圖分析詳細程度設置
    const screenshotDetailLevel = await getFromStorage('screenshot_detail_level') || 'medium'; // Default to medium
    
    // 發送截圖給LLM進行分析
    await analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, screenshotDetailLevel);
    
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
async function analyzeScreenshotWithLLM(screenshotDataUrl, timestamp, detailLevel = 'medium') {
  console.log(`[BACKGROUND_SCRIPT] Analyzing screenshot with LLM (Detail Level: ${detailLevel})`);
  
  try {
    // 從localStorage獲取設置
    const apiKey = await getFromStorage('openai_api_key');
    const apiEndpoint = await getFromStorage('openai_api_endpoint') || 'https://api.openai.com/v1';
    const screenshotModel = await getFromStorage('openai_screenshot_model') || 'gpt-4o';
    
    console.log(`[BACKGROUND_SCRIPT] Screenshot analysis settings - Model: ${screenshotModel}, Endpoint: ${apiEndpoint}`);
    
    if (!apiKey) {
      console.error('[BACKGROUND_SCRIPT] No API key found for screenshot analysis');
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: 'No API key configured for screenshot analysis'
      });
      return;
    }
    
    if (!screenshotModel) {
      console.error('[BACKGROUND_SCRIPT] No screenshot model selected');
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: 'No screenshot model selected in settings'
      });
      return;
    }
    
    // 準備API請求
    const baseApiUrl = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
    
    let promptText = "Please analyze this screenshot from a Teams meeting or presentation. Provide a concise summary of what you see, including any visible text, UI elements, presentation content, or meeting activities. Focus on information that would be relevant for meeting notes or evaluation purposes.";

    if (detailLevel === 'low') {
      promptText = "Provide a very brief, one-sentence summary of this screenshot, focusing on the main subject.";
    } else if (detailLevel === 'high') {
      promptText = "Provide a highly detailed and comprehensive analysis of this screenshot. Describe all visible text, UI elements, buttons, icons, presentation content (including titles, bullet points, images, charts, graphs), any people visible, and infer the current meeting activity or context. Be as exhaustive as possible.";
    }
    
    const requestBody = {
      model: screenshotModel,
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
    
    const response = await fetch(`${baseApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[BACKGROUND_SCRIPT] Screenshot analysis API error:', response.status, errorText);
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: `API error: ${response.status} - ${errorText}`
      });
      return;
    }
    
    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content;
    
    if (analysis) {
      console.log('[BACKGROUND_SCRIPT] Screenshot analysis completed:', analysis);
      
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
      });
      
      console.log('[BACKGROUND_SCRIPT] Screenshot analysis saved and notification sent');
    } else {
      console.warn('[BACKGROUND_SCRIPT] No analysis content received from LLM');
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: 'No analysis content received from AI model'
      });
    }
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Screenshot analysis failed:', error);
    chrome.runtime.sendMessage({
      action: 'screenshotAnalysisError',
      error: `Screenshot analysis failed: ${error.message}`
    });
  }
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
async function processAudioChunkInBackground(audioBase64, timestamp, isFinal) {
  try {
    console.log('[BACKGROUND_SCRIPT] Processing audio chunk in background:', timestamp);
    console.log('[BACKGROUND_SCRIPT] Is final chunk:', isFinal ? 'Yes' : 'No');
    
    // 獲取API設置
    const apiKey = await getFromStorage('openai_api_key');
    const apiEndpoint = await getFromStorage('openai_api_endpoint') || 'https://api.openai.com/v1';
    const selectedLanguage = await getFromStorage('transcription_language') || '';
    
    if (!apiKey) {
      console.error('[BACKGROUND_SCRIPT] No API key found for transcription');
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: 'No OpenAI API key configured'
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
    const baseApiUrl = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
    console.log(`[BACKGROUND_SCRIPT] Using API endpoint for transcription: ${baseApiUrl}`);
    
    // 建立FormData
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    // 添加語言參數（如果用戶有選擇的話）
    if (selectedLanguage) {
      formData.append('language', selectedLanguage);
      console.log(`[BACKGROUND_SCRIPT] Using language: ${selectedLanguage}`);
    } else {
      console.log('[BACKGROUND_SCRIPT] Using auto-detect language');
    }
    
    // 調用API進行轉錄
    const response = await fetch(`${baseApiUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[BACKGROUND_SCRIPT] Transcription API error:', response.status, errorText);
      chrome.runtime.sendMessage({
        action: 'transcriptionError',
        error: `API error: ${response.status} - ${errorText}`
      });
      return;
    }
    
    const result = await response.json();
    
    // Check if transcription has content
    if (!result.text || result.text.trim() === '') {
      console.warn('[BACKGROUND_SCRIPT] Transcription returned empty text');
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
    });
    
    // 如果是最後一個區塊，保存到團隊記錄
    if (isFinal) {
      console.log('[BACKGROUND_SCRIPT] Final chunk received, preparing to save transcript to team');
      // 延遲保存以確保所有處理完成
      setTimeout(() => {
        saveTranscriptToTeamInBackground();
      }, 1000);
    }
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] Audio processing failed:', error);
    chrome.runtime.sendMessage({
      action: 'transcriptionError',
      error: `Audio processing failed: ${error.message}`
    });
  }
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
async function saveTranscriptToTeamInBackground() {
  try {
    console.log('[BACKGROUND_SCRIPT] saveTranscriptToTeamInBackground - Starting to save transcript');
    console.log('[BACKGROUND_SCRIPT] Active team ID:', captureState.activeTeamId);
    console.log('[BACKGROUND_SCRIPT] Transcript chunks length:', captureState.transcriptChunks.length);
    
    if (!captureState.activeTeamId) {
      console.warn('[BACKGROUND_SCRIPT] Cannot save transcript: no active team ID');
      return false;
    }
    
    if (captureState.transcriptChunks.length === 0) {
      console.warn('[BACKGROUND_SCRIPT] Cannot save transcript: empty chunks');
      return false;
    }
    
    const fullText = captureState.transcriptChunks.map(chunk => {
      if (chunk.type === 'screenshot') {
        return `[📸 ${chunk.analysis}]`;
      }
      return chunk.text || chunk.analysis || '';
    }).join(' ');
    
    // 通知前端保存轉錄記錄
    chrome.runtime.sendMessage({
      action: 'saveTranscriptToTeam',
      teamId: captureState.activeTeamId,
      transcriptChunks: captureState.transcriptChunks,
      fullText: fullText
    });
    
    console.log('[BACKGROUND_SCRIPT] Transcript save request sent to frontend');
    return true;
    
  } catch (error) {
    console.error('[BACKGROUND_SCRIPT] saveTranscriptToTeamInBackground error:', error);
    return false;
  }
}