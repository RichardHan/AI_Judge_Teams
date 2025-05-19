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
});

// 訊息處理
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  switch (message.action) {
    case 'getCaptureState':
      sendResponse({
        isCapturing: captureState.isCapturing,
        activeTeamId: captureState.activeTeamId
      });
      break;
      
    case 'startCapture':
      try {
        // 如果已經在捕獲，先停止
        if (captureState.isCapturing) {
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
          
          captureStream = stream;
          audioChunks = [];
          captureState.isCapturing = true;
          captureState.activeTeamId = message.options.teamId;
          captureState.captureMode = message.options.captureMode;
          captureState.startTime = Date.now();
          
          // 設置音訊錄製
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) {
              audioChunks.push(e.data);
              console.log('收集音訊區塊:', audioChunks.length, e.data.size, 'bytes');
            }
          };
          mediaRecorder.start();
          
          // 每 10 秒轉錄一次
          transcribeInterval = setInterval(() => {
            if (audioChunks.length > 0) {
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
              audioChunks = []; // 清空，開始收集下一段
              
              // 把音訊 blob 轉成 base64 再傳送
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                // Save the audio blob before sending for transcription
                saveAudioBlobToFile(audioBlob, "segment");

                // 傳給 popup 處理
                chrome.runtime.sendMessage({
                  action: 'audioChunk',
                  audioBase64: base64data,
                  timestamp: new Date().toISOString()
                });
              };
              reader.readAsDataURL(audioBlob);
              
              // 啟動新的錄製
              mediaRecorder.start();
            }
          }, 10000);
          
          // 通知所有打開的擴展頁面狀態已更改
          chrome.runtime.sendMessage({
            action: 'captureStateChanged',
            state: {
              isCapturing: captureState.isCapturing
            }
          });
          
          sendResponse({ success: true });
        });
        
      } catch (error) {
        console.error('開始捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'stopCapture':
      try {
        stopCapturing();
        sendResponse({ success: true });
        
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
  captureState.isCapturing = false;
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  if (captureStream) {
    captureStream.getTracks().forEach(track => track.stop());
    captureStream = null;
  }
  
  if (transcribeInterval) {
    clearInterval(transcribeInterval);
    transcribeInterval = null;
  }
  
  // 處理剩餘的音訊區塊
  if (audioChunks.length > 0) {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    
    // 把音訊 blob 轉成 base64 再傳送
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      // Save the final audio blob
      saveAudioBlobToFile(audioBlob, "final_segment");

      // 傳給 popup 處理
      chrome.runtime.sendMessage({
        action: 'audioChunk',
        audioBase64: base64data,
        timestamp: new Date().toISOString(),
        isFinal: true
      });
    };
    reader.readAsDataURL(audioBlob);
  }
}

// Helper function to save audio blob to a file
function saveAudioBlobToFile(audioBlob, segmentType) {
  if (!captureState.activeTeamId) {
    console.warn('Cannot save audio file: activeTeamId is not set.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-'); // Sanitize timestamp for filename
  const filename = `audio_capture/${captureState.activeTeamId}_${segmentType}_${timestamp}.webm`;

  const url = URL.createObjectURL(audioBlob);

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: false // Set to true if you want the user to be prompted for save location each time
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('Error downloading audio file:', chrome.runtime.lastError.message);
    } else {
      console.log('Audio segment saved as:', filename, 'Download ID:', downloadId);
    }
    // It's good practice to revoke the object URL after the download has started or failed,
    // but with downloads, it's tricky. Chrome handles revocation for `chrome.downloads`.
    // If not using chrome.downloads, you'd do URL.revokeObjectURL(url) in a timeout or callback.
  });
}