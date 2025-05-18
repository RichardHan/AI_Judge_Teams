// 背景腳本狀態管理
let captureState = {
  isCapturing: false,
  activeTeamId: null,
  captureMode: null,
  startTime: null
};

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
        // 這裡將來會實現實際捕獲功能
        captureState.isCapturing = true;
        captureState.activeTeamId = message.options.teamId;
        captureState.captureMode = message.options.captureMode;
        captureState.startTime = Date.now();
        
        sendResponse({ success: true });
        
        // 通知所有打開的擴展頁面狀態已更改
        chrome.runtime.sendMessage({
          action: 'captureStateChanged',
          state: {
            isCapturing: captureState.isCapturing
          }
        });
      } catch (error) {
        console.error('開始捕獲失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'stopCapture':
      try {
        // 這裡將來會停止捕獲功能
        captureState.isCapturing = false;
        
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