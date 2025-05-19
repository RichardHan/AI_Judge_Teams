// Add feedback message area if not present
function ensureMessageArea() {
  let msgArea = document.getElementById('popupMessageArea');
  if (!msgArea) {
    msgArea = document.createElement('div');
    msgArea.id = 'popupMessageArea';
    msgArea.style.position = 'fixed';
    msgArea.style.top = '10px';
    msgArea.style.left = '50%';
    msgArea.style.transform = 'translateX(-50%)';
    msgArea.style.zIndex = '9999';
    msgArea.style.padding = '8px 20px';
    msgArea.style.borderRadius = '6px';
    msgArea.style.fontWeight = 'bold';
    msgArea.style.fontSize = '16px';
    msgArea.style.display = 'none';
    // Ensure body is loaded before appending
    if (document.body) {
      document.body.appendChild(msgArea);
    } else {
      // Fallback if body is not ready, though less likely for popup script
      // For popup scripts, document.body should generally be available when script runs.
      // Simpler to assume body exists or let it fail if it genuinely doesn't at this stage for a popup.
      document.body.appendChild(msgArea); 
    }
  }
  return msgArea;
}

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
  const captureMode = localStorage.getItem('captureMode') || 'segmented';
  loadSettings();
  
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

// Helper function to show popup messages
function showPopupMessage(message, type = 'success', duration = 3000) {
  const msgArea = ensureMessageArea(); // Ensure message area exists
  msgArea.textContent = message;
  msgArea.style.display = 'block';
  msgArea.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
  msgArea.style.color = type === 'success' ? '#155724' : '#721c24';
  
  setTimeout(() => {
    msgArea.style.display = 'none';
  }, duration);
}

// Function to load saved settings
function loadSettings() {
  const savedApiKey = localStorage.getItem('openai_api_key') || '';
  const savedApiEndpoint = localStorage.getItem('openai_api_endpoint') || 'https://api.openai.com/v1';
  // const savedModel = localStorage.getItem('openai_model') || ''; // We'll populate models after testing

  document.getElementById('apiKeyInput').value = savedApiKey;
  document.getElementById('apiEndpointInput').value = savedApiEndpoint;
  // If there's a saved API key, try to load models
  if (savedApiKey && savedApiEndpoint) {
    testAPIConnection(false); // false to not show success message on initial load
  }
}

// Function to test API connection and fetch models
async function testAPIConnection(showMessage = true) {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiEndpointInput = document.getElementById('apiEndpointInput');
  const modelSelect = document.getElementById('modelSelect');
  
  const apiKey = apiKeyInput.value.trim();
  const apiEndpoint = apiEndpointInput.value.trim() || 'https://api.openai.com/v1'; // Default if empty
  
  if (!apiKey) {
    if (showMessage) showPopupMessage('Please enter your OpenAI API Key.', 'error');
    apiKeyInput.focus();
    return false;
  }
  
  modelSelect.innerHTML = '<option value="">Testing connection...</option>';
  modelSelect.disabled = true;
  
  try {
    const response = await fetch(`${apiEndpoint}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: response.statusText }));
      const errorMessage = errorData.error && errorData.error.message ? errorData.error.message : (errorData.message || 'Unknown error');
      throw new Error(`API request failed: ${response.status} - ${errorMessage}`);
    }
    
    const data = await response.json();
    const models = data.data || []; // Models are in the 'data' array
    
    modelSelect.innerHTML = ''; // Clear previous options
    
    if (models.length > 0) {
      // Filter for gpt models if desired, or list all
      // For now, let's list all models that are not 'owned_by': 'openai-internal'
      // And sort them, putting 'gpt' models first.
      const filteredModels = models
        .filter(model => model.id && model.owned_by !== 'openai-internal')
        .sort((a, b) => {
          const aIsGpt = a.id.startsWith('gpt');
          const bIsGpt = b.id.startsWith('gpt');
          if (aIsGpt && !bIsGpt) return -1;
          if (!aIsGpt && bIsGpt) return 1;
          return a.id.localeCompare(b.id);
        });

      if (filteredModels.length === 0) {
        modelSelect.innerHTML = '<option value="">No compatible models found.</option>';
         if (showMessage) showPopupMessage('Connection successful, but no compatible models found.', 'error');
      } else {
        filteredModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          modelSelect.appendChild(option);
        });
        // Try to select previously saved model
        const savedModel = localStorage.getItem('openai_model');
        if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
            modelSelect.value = savedModel;
        }
        if (showMessage) showPopupMessage('Connection successful! Models loaded.', 'success');
      }
    } else {
      modelSelect.innerHTML = '<option value="">No models found.</option>';
      if (showMessage) showPopupMessage('Connection successful, but no models returned.', 'error');
    }
    return true;
  } catch (error) {
    console.error('API Connection Test Error:', error);
    modelSelect.innerHTML = '<option value="">Connection failed. Check console.</option>';
    if (showMessage) showPopupMessage(`Connection failed: ${error.message}`, 'error', 5000);
    return false;
  } finally {
    modelSelect.disabled = false;
  }
}

// Event listener for Test Connection button
document.getElementById('testConnectionBtn').addEventListener('click', () => testAPIConnection(true));

// Event listener for Save Settings button
document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  const selectedModel = document.getElementById('modelSelect').value;

  if (!apiKey) {
    showPopupMessage('API Key cannot be empty.', 'error');
    document.getElementById('apiKeyInput').focus();
    return;
  }

  // Test connection before saving if models aren't loaded or selection is empty
  const modelSelect = document.getElementById('modelSelect');
  if (!modelSelect.value || modelSelect.options.length <=1 && modelSelect.options[0].value === "") {
      showPopupMessage('Testing connection before saving...', 'success');
      const connectionSuccessful = await testAPIConnection(true);
      if (!connectionSuccessful) {
          showPopupMessage('Cannot save settings. API connection failed.', 'error');
          return;
      }
      // Re-check selected model after testAPIConnection populates it
      const newlySelectedModel = document.getElementById('modelSelect').value;
      if (!newlySelectedModel) {
          showPopupMessage('Please select a model after successful connection test.', 'error');
          return;
      }
       localStorage.setItem('openai_model', newlySelectedModel);
  } else {
      localStorage.setItem('openai_model', selectedModel);
  }

  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('openai_api_endpoint', apiEndpoint);
  
  showPopupMessage('Settings saved successfully!', 'success');
  console.log('Settings saved:', { apiKey, apiEndpoint, model: localStorage.getItem('openai_model') });
}); 