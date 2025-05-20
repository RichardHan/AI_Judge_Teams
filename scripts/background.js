console.log('[BACKGROUND_SCRIPT] background.js script started');
// 背景腳本狀態管理
let captureState = {
  isCapturing: false,
  activeTeamId: null,
  captureMode: null,
  startTime: null
};

// 錄音相關
let captureStream = null;
let mediaRecorder = null;
let audioChunks = [];
let transcribeInterval = null;
let activeTabId = null;

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
      try {
        // 如果已經在捕獲，先停止
        if (captureState.isCapturing) {
          console.log('[BACKGROUND_SCRIPT] Already capturing, stopping existing capture first.');
          stopCapturing();
        }
        
        // 啟動捕獲程序
        console.log('[BACKGROUND_SCRIPT] Attempting to start capture. Checking chrome.tabCapture object:', chrome.tabCapture);
        if (chrome.tabCapture && typeof chrome.tabCapture.capture === 'function') {
          console.log('[BACKGROUND_SCRIPT] chrome.tabCapture.capture IS a function.');
        } else {
          console.error('[BACKGROUND_SCRIPT] chrome.tabCapture.capture IS NOT a function or chrome.tabCapture is undefined.');
          sendResponse({ success: false, error: 'chrome.tabCapture.capture is not available or not a function in background script.' });
          return; // Important: stop further execution if the API is not available
        }
        
        chrome.tabCapture.capture({ audio: true, video: false }, stream => {
          if (!stream) {
            console.error('無法捕獲標籤頁音訊');
            sendResponse({ success: false, error: '無法捕獲標籤頁音訊' });
            return;
          }
          console.log('[BACKGROUND_SCRIPT] Tab capture successful, stream obtained.');
          
          captureStream = stream;
          audioChunks = []; // Reset audioChunks
          captureState.isCapturing = true;
          captureState.activeTeamId = message.options.teamId;
          console.log(`[BACKGROUND_SCRIPT] captureState.activeTeamId set to: ${captureState.activeTeamId} from message options.`);
          captureState.captureMode = message.options.captureMode;
          captureState.startTime = Date.now();
          
          // 設置音訊錄製
          mediaRecorder = new MediaRecorder(stream);
          
          mediaRecorder.ondataavailable = e => {
            console.log('[BACKGROUND_SCRIPT] ondataavailable triggered.');
            if (e.data.size > 0) {
              audioChunks.push(e.data);
              console.log('收集音訊區塊:', audioChunks.length, e.data.size, 'bytes', 'Current audioChunks (sizes):', JSON.stringify(audioChunks.map(chunk => chunk.size)));
            }
          };

          mediaRecorder.onstop = () => {
            console.log('[BACKGROUND_SCRIPT] mediaRecorder.onstop event fired. Current audioChunks.length:', audioChunks.length);
            if (audioChunks.length > 0) {
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              audioChunks = []; // Clear after processing
              
              saveAudioBlobToFile(audioBlob, "final_segment");

              // 傳給 popup 處理最後的音訊
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                console.log('[BACKGROUND_SCRIPT] Sending final audioChunk (from onstop) to popup.');
                chrome.runtime.sendMessage({
                  action: 'audioChunk',
                  audioBase64: base64data,
                  timestamp: new Date().toISOString(),
                  isFinal: true
                });
              };
              reader.readAsDataURL(audioBlob);
            } else {
              console.log('[BACKGROUND_SCRIPT] mediaRecorder.onstop: No audio chunks to process.');
            }
          };
          
          mediaRecorder.start(10000); // Start recording with 10-second timeslices
          console.log('[BACKGROUND_SCRIPT] MediaRecorder started with 10-second timeslices.');
          
          // 每 10 秒處理一次累積的音訊區塊 (由 ondataavailable 填充)
          if (transcribeInterval) clearInterval(transcribeInterval); // Clear any existing interval
          transcribeInterval = setInterval(() => {
            console.log('[BACKGROUND_SCRIPT] transcribeInterval fired. audioChunks.length:', audioChunks.length);
            if (audioChunks.length > 0) {
              // Create a blob from all current chunks for this segment
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              audioChunks = []; // Important: Clear chunks after creating blob for this segment
              
              saveAudioBlobToFile(audioBlob, "segment");

              // 把音訊 blob 轉成 base64 再傳送
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                console.log('[BACKGROUND_SCRIPT] Sending audioChunk (segment) to popup.');
                chrome.runtime.sendMessage({
                  action: 'audioChunk',
                  audioBase64: base64data,
                  timestamp: new Date().toISOString()
                });
              };
              reader.readAsDataURL(audioBlob);
              
              // No need to call mediaRecorder.start() here anymore
            }
          }, 10000); // Interval matches timeslice for simplicity
          
          // 通知所有打開的擴展頁面狀態已更改
          chrome.runtime.sendMessage({
            action: 'captureStateChanged',
            state: {
              isCapturing: captureState.isCapturing
            }
          });
          
          sendResponse({ success: true });
          console.log('[BACKGROUND_SCRIPT] startCapture successful.');
        });
        
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

// 停止所有捕獲
function stopCapturing() {
  console.log('[BACKGROUND_SCRIPT] stopCapturing called.');
  
  if (transcribeInterval) {
    clearInterval(transcribeInterval);
    transcribeInterval = null;
    console.log('[BACKGROUND_SCRIPT] Transcribe interval cleared.');
  }
  
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop(); // This will trigger ondataavailable with any final data, then onstop
    console.log('[BACKGROUND_SCRIPT] mediaRecorder.stop() called.');
  } else if (mediaRecorder && mediaRecorder.state === 'paused') { // Should not happen with current logic
     mediaRecorder.stop();
     console.log('[BACKGROUND_SCRIPT] mediaRecorder.stop() called from paused state.');
  } else {
    console.log('[BACKGROUND_SCRIPT] MediaRecorder not recording or already stopped.');
    // Fallback: If onstop didn't handle for some reason, or recorder was never active.
    // This case should ideally not be hit if onstop works as expected.
    if (audioChunks.length > 0) {
        console.warn('[BACKGROUND_SCRIPT] Processing residual audio chunks in stopCapturing as a fallback.');
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        saveAudioBlobToFile(audioBlob, "final_segment_fallback");
        // Consider sending to popup as well if this fallback is critical
    }
  }
  
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
    console.log('[BACKGROUND_SCRIPT] Capture stream tracks stopped.');
  }
  
  captureState.isCapturing = false; // Set state after operations
  // Note: Final audio processing and saving is now primarily handled by mediaRecorder.onstop
  console.log('[BACKGROUND_SCRIPT] stopCapturing finished. isCapturing:', captureState.isCapturing);
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