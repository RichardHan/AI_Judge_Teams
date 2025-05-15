// 全局狀態
let captureState = {
  isCapturing: false,
  currentStream: null,
  mediaCaptureManager: null,
  activeTabId: null,
  activeTeamId: null
};

// 初始化監聽器
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Hackathon Judge 擴展已安裝');
});

// 處理來自popup或content腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('收到消息:', message);
  
  // 處理開始捕獲請求
  if (message.action === 'startCapture') {
    handleStartCapture(message.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 異步回應
  }
  
  // 處理停止捕獲請求
  if (message.action === 'stopCapture') {
    handleStopCapture()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // 處理更新團隊ID
  if (message.action === 'setActiveTeam') {
    captureState.activeTeamId = message.teamId;
    sendResponse({ success: true });
  }
  
  // 處理獲取捕獲狀態
  if (message.action === 'getCaptureState') {
    sendResponse({
      isCapturing: captureState.isCapturing,
      activeTeamId: captureState.activeTeamId
    });
  }
});

// 處理開始捕獲
async function handleStartCapture(options) {
  if (captureState.isCapturing) {
    return { success: false, error: '已經在捕獲中' };
  }
  
  try {
    // 動態加載媒體捕獲管理器
    if (!captureState.mediaCaptureManager) {
      const { MediaCaptureManager } = await import('./scripts/mediaCapture.js');
      captureState.mediaCaptureManager = new MediaCaptureManager(options);
    }
    
    // 初始化捕獲
    const initialized = await captureState.mediaCaptureManager.initialize(options.captureMode);
    if (!initialized) {
      throw new Error('媒體捕獲初始化失敗');
    }
    
    // 開始錄製
    const started = captureState.mediaCaptureManager.startRecording();
    if (!started) {
      throw new Error('錄製啟動失敗');
    }
    
    captureState.isCapturing = true;
    
    // 發送狀態更新
    chrome.runtime.sendMessage({
      action: 'captureStateChanged',
      state: { isCapturing: true }
    });
    
    return { success: true };
  } catch (error) {
    console.error('開始捕獲失敗:', error);
    return { success: false, error: error.message };
  }
}

// 處理停止捕獲
async function handleStopCapture() {
  if (!captureState.isCapturing) {
    return { success: false, error: '沒有活動的捕獲' };
  }
  
  try {
    // 停止錄製
    captureState.mediaCaptureManager.stopRecording();
    
    // 重置狀態
    captureState.isCapturing = false;
    
    // 發送狀態更新
    chrome.runtime.sendMessage({
      action: 'captureStateChanged',
      state: { isCapturing: false }
    });
    
    return { success: true };
  } catch (error) {
    console.error('停止捕獲失敗:', error);
    return { success: false, error: error.message };
  }
}