// Teams 頁面特定邏輯
console.log('AI Hackathon Judge 內容腳本已載入');

// 監聽Teams頁面上的特定元素變化
function observeTeamsElements() {
  // 創建一個觀察器實例
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // 檢測是否有共享屏幕啟動
      const sharingIndicators = document.querySelectorAll('[data-tid="calling-share-tray-button"]');
      if (sharingIndicators.length > 0) {
        // 通知背景腳本有屏幕共享活動
        chrome.runtime.sendMessage({
          action: 'teamsScreenShareDetected'
        });
      }
      
      // 檢測參會者名稱變化
      const participantsList = document.querySelectorAll('[data-tid="roster-person"]');
      if (participantsList.length > 0) {
        const participants = Array.from(participantsList).map(el => el.textContent.trim());
        chrome.runtime.sendMessage({
          action: 'teamsParticipantsUpdated',
          participants
        });
      }
    });
  });
  
  // 開始觀察文檔
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// 在頁面完全加載後觀察
window.addEventListener('load', () => {
  // 檢查是否在Teams網頁
  if (window.location.href.includes('teams.microsoft.com')) {
    observeTeamsElements();
  }
});

// 監聽來自背景腳本的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 處理來自背景腳本的消息
  if (message.action === 'checkTeamsStatus') {
    const isTeamsMeeting = document.querySelectorAll('[data-tid="call-composite"]').length > 0;
    sendResponse({ isTeamsMeeting });
  }
});