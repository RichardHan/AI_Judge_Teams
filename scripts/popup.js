// 頁面載入後執行的初始化函數
document.addEventListener('DOMContentLoaded', function() {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const teamSelect = document.getElementById('teamSelect');
  const statusDisplay = document.getElementById('status');
  const transcriptContainer = document.getElementById('transcriptContainer');
  
  let activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
  let currentState = { isCapturing: false, activeTeamId: null };
  let transcriptChunks = [];
  
  // 載入設定
  const apiKey = localStorage.getItem('openai_api_key') || '';
  const captureMode = localStorage.getItem('captureMode') || 'segmented';
  document.getElementById('apiKeyInput').value = apiKey;
  
  // 載入隊伍選擇
  function loadTeamSelect() {
    teamSelect.innerHTML = '';
    activeTeams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
    });
    
    // 如果有活躍的團隊ID，則選擇它
    if (currentState.activeTeamId) {
      teamSelect.value = currentState.activeTeamId;
    }
  }
  
  // 獲取當前捕獲狀態
  chrome.runtime.sendMessage({ action: 'getCaptureState' }, function(response) {
    currentState = response;
    updateUIState();
  });
  
  // 切換團隊選擇功能
  teamSelect.addEventListener('change', function() {
    const selectedTeamId = this.value;
    chrome.runtime.sendMessage(
      { action: 'setActiveTeam', teamId: selectedTeamId },
      function(response) {
        if (response.success) {
          currentState.activeTeamId = selectedTeamId;
        } else {
          console.error('設置團隊失敗:', response.error);
          alert('設置團隊失敗: ' + response.error);
          // 重置選項為當前活躍的團隊
          teamSelect.value = currentState.activeTeamId;
        }
      }
    );
  });
  
  // 開始捕獲按鈕點擊事件
  startBtn.addEventListener('click', function() {
    const selectedTeamId = teamSelect.value;
    if (!selectedTeamId) {
      alert('請先選擇或創建一個團隊');
      return;
    }
    
    // 清空轉錄文本顯示
    transcriptContainer.innerHTML = '';
    transcriptChunks = [];
    
    // 檢查API金鑰
    const apiKey = document.getElementById('apiKeyInput').value;
    if (!apiKey) {
      alert('請輸入您的 OpenAI API 金鑰');
      return;
    }
    
    // 儲存API金鑰
    localStorage.setItem('openai_api_key', apiKey);
    
    chrome.runtime.sendMessage(
      { 
        action: 'startCapture', 
        options: { 
          teamId: selectedTeamId,
          captureMode: captureMode
        } 
      },
      function(response) {
        if (response.success) {
          currentState.isCapturing = true;
          currentState.activeTeamId = selectedTeamId;
          updateUIState();
        } else {
          console.error('開始捕獲失敗:', response.error);
          alert('開始捕獲失敗: ' + response.error);
        }
      }
    );
  });
  
  // 停止捕獲按鈕點擊事件
  stopBtn.addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'stopCapture' }, function(response) {
      if (response.success) {
        currentState.isCapturing = false;
        updateUIState();
      } else {
        console.error('停止捕獲失敗:', response.error);
        alert('停止捕獲失敗: ' + response.error);
      }
    });
  });
  
  // 添加團隊按鈕點擊事件
  document.getElementById('addTeamBtn').addEventListener('click', function() {
    const teamName = prompt('請輸入新團隊名稱:');
    if (teamName) {
      const newTeam = {
        id: Date.now().toString(),
        name: teamName,
        transcripts: []
      };
      
      activeTeams.push(newTeam);
      localStorage.setItem('teams', JSON.stringify(activeTeams));
      loadTeamSelect();
      
      // 自動選擇新建的團隊
      teamSelect.value = newTeam.id;
      
      // 通知背景腳本更新活躍團隊
      chrome.runtime.sendMessage(
        { action: 'setActiveTeam', teamId: newTeam.id },
        function(response) {
          if (response.success) {
            currentState.activeTeamId = newTeam.id;
          }
        }
      );
    }
  });
  
  // 更新UI狀態
  function updateUIState() {
    if (currentState.isCapturing) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      teamSelect.disabled = true;
      statusDisplay.textContent = '錄製中...';
      statusDisplay.style.color = 'red';
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      teamSelect.disabled = false;
      statusDisplay.textContent = 'Ready';
      statusDisplay.style.color = 'green';
    }
  }
  
  // 接收背景腳本的訊息
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Popup received message:', message);
    
    switch (message.action) {
      case 'captureStateChanged':
        currentState = message.state;
        updateUIState();
        break;
        
      case 'audioChunk':
        // 處理收到的音訊區塊
        processAudioChunk(message);
        break;
    }
    
    return true;
  });
  
  // 處理音訊區塊並轉錄
  async function processAudioChunk(message) {
    try {
      console.log('處理音訊區塊:', message.timestamp);
      
      // 獲取API金鑰
      const apiKey = document.getElementById('apiKeyInput').value;
      if (!apiKey) {
        console.error('沒有設置 OpenAI API 金鑰');
        return;
      }
      
      // 建立音訊檔案
      const audioBlob = base64ToBlob(message.audioBase64, 'audio/webm');
      
      // 建立FormData
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'zh');
      
      // 調用OpenAI Whisper API進行轉錄
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        console.error('API請求失敗:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('API錯誤詳情:', errorText);
        return;
      }
      
      const result = await response.json();
      
      // 保存轉錄結果
      const transcriptChunk = {
        timestamp: message.timestamp,
        text: result.text,
        isFinal: message.isFinal || false
      };
      
      transcriptChunks.push(transcriptChunk);
      
      // 更新顯示
      displayTranscript();
      
      // 如果是最後一個區塊，保存到團隊記錄
      if (message.isFinal) {
        saveTranscriptToTeam();
      }
      
    } catch (error) {
      console.error('處理音訊區塊失敗:', error);
    }
  }
  
  // base64轉Blob
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
  
  // 顯示轉錄結果
  function displayTranscript() {
    transcriptContainer.innerHTML = '';
    
    transcriptChunks.forEach((chunk, index) => {
      const chunkElement = document.createElement('div');
      chunkElement.className = 'transcript-chunk';
      
      // 格式化時間戳
      const date = new Date(chunk.timestamp);
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      
      chunkElement.innerHTML = `
        <div class="chunk-header">
          <span class="chunk-time">${formattedTime}</span>
        </div>
        <div class="chunk-text">${chunk.text}</div>
      `;
      
      transcriptContainer.appendChild(chunkElement);
    });
    
    // 自動滾動到底部
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
  }
  
  // 保存轉錄到團隊記錄
  function saveTranscriptToTeam() {
    const activeTeamId = currentState.activeTeamId;
    if (!activeTeamId || transcriptChunks.length === 0) return;
    
    const fullText = transcriptChunks.map(chunk => chunk.text).join(' ');
    
    // 找到當前團隊
    const teamIndex = activeTeams.findIndex(team => team.id === activeTeamId);
    if (teamIndex === -1) return;
    
    // 添加新的轉錄記錄
    const newTranscript = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      text: fullText,
      chunks: transcriptChunks
    };
    
    activeTeams[teamIndex].transcripts.push(newTranscript);
    
    // 保存更新後的團隊數據
    localStorage.setItem('teams', JSON.stringify(activeTeams));
    console.log('轉錄已保存到團隊記錄');
  }
  
  // 設置按鈕事件
  document.getElementById('settingsBtn').addEventListener('click', function() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
  });
  
  // 顯示團隊記錄按鈕事件
  document.getElementById('showHistoryBtn').addEventListener('click', function() {
    window.location.href = 'history.html';
  });
  
  // 初始載入團隊選擇
  loadTeamSelect();
}); 