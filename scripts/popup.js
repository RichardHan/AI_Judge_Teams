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
  console.log('[POPUP_SCRIPT] 頁面載入完成，初始化應用');
  
  // 立即從localStorage讀取團隊數據
  try {
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    console.log('[POPUP_SCRIPT] 已從localStorage載入團隊數據，團隊數量:', activeTeams.length);
    if (activeTeams.length > 0) {
      activeTeams.forEach((team, idx) => {
        console.log(`[POPUP_SCRIPT] 團隊 ${idx+1}: ${team.name}, 轉錄數: ${team.transcripts ? team.transcripts.length : 0}`);
      });
    } else {
      console.log('[POPUP_SCRIPT] 沒有找到團隊數據，將創建空陣列');
      activeTeams = [];
      // 創建一個測試團隊以便使用
      if (confirm('沒有找到團隊數據，是否創建一個測試團隊?')) {
        const newTeam = {
          id: Date.now().toString(),
          name: "測試團隊",
          transcripts: []
        };
        activeTeams.push(newTeam);
        localStorage.setItem('teams', JSON.stringify(activeTeams));
        console.log('[POPUP_SCRIPT] 已創建測試團隊');
      }
    }
  } catch (error) {
    console.error('[POPUP_SCRIPT] 載入團隊數據出錯:', error);
    activeTeams = [];
  }
  
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const teamSelect = document.getElementById('teamSelect');
  const statusDisplay = document.getElementById('status');
  const transcriptContainer = document.getElementById('transcriptContainer');
  
  let currentState = { isCapturing: false, activeTeamId: null };
  let transcriptChunks = [];
  
  // 載入設定
  const captureMode = localStorage.getItem('captureMode') || 'segmented';
  loadSettings();
  
  // 載入隊伍選擇
  function loadTeamSelect() {
    console.log('[POPUP_SCRIPT] Loading team select dropdown...');
    
    // 從localStorage獲取最新團隊數據
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    console.log('[POPUP_SCRIPT] Teams loaded from localStorage:', activeTeams.length);
    
    // 清空下拉選單
    teamSelect.innerHTML = '';
    
    if (activeTeams.length === 0) {
      // 如果沒有團隊，顯示提示選項
      const option = document.createElement('option');
      option.value = "";
      option.textContent = "請先創建一個團隊";
      option.disabled = true;
      option.selected = true;
      teamSelect.appendChild(option);
      console.log('[POPUP_SCRIPT] No teams found, showing placeholder option');
      return;
    }
    
    // 添加每個團隊選項
    activeTeams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
      console.log(`[POPUP_SCRIPT] Added team option: ${team.name} (${team.id})`);
    });
    
    // 如果有活躍的團隊ID，則選擇它
    if (currentState.activeTeamId) {
      const teamExists = activeTeams.some(team => team.id === currentState.activeTeamId);
      if (teamExists) {
        teamSelect.value = currentState.activeTeamId;
        console.log(`[POPUP_SCRIPT] Selected active team: ${currentState.activeTeamId}`);
      } else {
        console.warn(`[POPUP_SCRIPT] Active team ID not found in teams list: ${currentState.activeTeamId}`);
        if (activeTeams.length > 0) {
          currentState.activeTeamId = activeTeams[0].id;
          teamSelect.value = currentState.activeTeamId;
          console.log(`[POPUP_SCRIPT] Defaulted to first team: ${currentState.activeTeamId}`);
        }
      }
    } else if (activeTeams.length > 0) {
      // 如果沒有活躍團隊但有團隊可選，默認選第一個
      currentState.activeTeamId = activeTeams[0].id;
      teamSelect.value = currentState.activeTeamId;
      console.log(`[POPUP_SCRIPT] No active team, defaulted to first team: ${currentState.activeTeamId}`);
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
    console.log('[POPUP_SCRIPT] Start Recording button clicked.');
    const selectedTeamId = teamSelect.value;
    if (!selectedTeamId) {
      alert('Please select or create a team first.');
      console.warn('[POPUP_SCRIPT] No team selected.');
      return;
    }
    
    // 清空轉錄文本顯示
    transcriptContainer.innerHTML = '';
    transcriptChunks = [];
    
    // 檢查API金鑰
    const apiKey = document.getElementById('apiKeyInput').value;
    console.log('[POPUP_SCRIPT] Checking API Key. Found:', apiKey ? 'Yes' : 'No');
    if (!apiKey) {
      alert('Please enter your OpenAI API Key.');
      console.warn('[POPUP_SCRIPT] OpenAI API Key is missing.');
      return;
    }
    
    // 儲存API金鑰
    localStorage.setItem('openai_api_key', apiKey);
    
    // 獲取下載檔案設定
    const downloadFiles = localStorage.getItem('download_audio_files') === 'true';
    console.log('[POPUP_SCRIPT] Download audio files setting:', downloadFiles);
    
    const messagePayload = {
      action: 'startCapture',
      options: {
        teamId: selectedTeamId,
        captureMode: captureMode,
        downloadFiles: downloadFiles
      }
    };
    console.log('[POPUP_SCRIPT] Sending startCapture message to background script with payload:', messagePayload);
    chrome.runtime.sendMessage(
      messagePayload,
      function(response) {
        console.log('[POPUP_SCRIPT] Received response from background script for startCapture:', response);
        if (response && response.success) {
          currentState.isCapturing = true;
          currentState.activeTeamId = selectedTeamId;
          updateUIState();
          console.log('[POPUP_SCRIPT] Capture started successfully, UI updated.');
        } else {
          console.error('開始捕獲失敗:', response ? response.error : 'No response or error field missing');
          alert('Failed to start capture: ' + (response ? response.error : 'Unknown error'));
        }
      }
    );
  });
  
  // 停止捕獲按鈕點擊事件
  stopBtn.addEventListener('click', function() {
    showPopupMessage("正在停止錄音...", "success", 2000);
    
    // 確保即使background.js未發送final chunk，我們也會存儲轉錄
    const forceSaveTranscript = function() {
      if (transcriptChunks.length > 0) {
        console.log('[POPUP_SCRIPT] 強制保存轉錄記錄，轉錄塊數量:', transcriptChunks.length);
        // 標記最後一個區塊為final
        transcriptChunks[transcriptChunks.length - 1].isFinal = true;
        // 保存轉錄
        if (saveTranscriptToTeam()) {
          console.log('[POPUP_SCRIPT] 成功保存轉錄記錄');
          showPopupMessage("轉錄已保存到歷史記錄", "success", 3000);
        } else {
          console.error('[POPUP_SCRIPT] 保存轉錄記錄失敗');
          showPopupMessage("保存轉錄失敗，請查看控制台", "error", 3000);
        }
      } else {
        console.warn('[POPUP_SCRIPT] 沒有轉錄內容可保存');
        showPopupMessage("無轉錄內容可保存", "error", 3000);
      }
    };
    
    chrome.runtime.sendMessage({ action: 'stopCapture' }, function(response) {
      console.log('[POPUP_SCRIPT] 停止錄音響應:', response);
      
      if (response && response.success) {
        // 更新UI
        currentState.isCapturing = false;
        updateUIState();
        
        // 延遲後處理轉錄保存，確保所有音訊塊已收到
        setTimeout(function() {
          console.log('[POPUP_SCRIPT] 延遲保存轉錄，確保所有塊已經處理');
          // 檢查是否有轉錄塊
          if (transcriptChunks.length > 0) {
            forceSaveTranscript();
          } else {
            console.warn('[POPUP_SCRIPT] 停止錄音後沒有轉錄塊');
            showPopupMessage("未檢測到有效轉錄", "error", 3000);
          }
        }, 3000); // 等待3秒確保所有API回應都已處理
      } else {
        console.error('[POPUP_SCRIPT] 停止捕獲失敗:', response ? response.error : '沒有回應');
        alert('停止錄音失敗: ' + (response ? response.error : '未知錯誤'));
        
        // 即使停止失敗，也嘗試保存現有轉錄
        if (transcriptChunks.length > 0) {
          forceSaveTranscript();
        }
      }
    });
  });
  
  // 添加團隊按鈕點擊事件
  document.getElementById('addTeamBtn').addEventListener('click', function() {
    const teamName = prompt('Please enter the new team name:');
    if (teamName) {
      // 獲取最新的團隊數據
      activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
      
      const newTeam = {
        id: Date.now().toString(),
        name: teamName,
        transcripts: []
      };
      
      console.log('[POPUP_SCRIPT] Creating new team:', newTeam);
      
      activeTeams.push(newTeam);
      localStorage.setItem('teams', JSON.stringify(activeTeams));
      
      // 確認團隊創建成功
      console.log('[POPUP_SCRIPT] Team created. Total teams:', activeTeams.length);
      console.log('[POPUP_SCRIPT] Teams in localStorage:', JSON.parse(localStorage.getItem('teams')));
      
      loadTeamSelect();
      
      // 自動選擇新建的團隊
      teamSelect.value = newTeam.id;
      
      // 通知背景腳本更新活躍團隊
      chrome.runtime.sendMessage(
        { action: 'setActiveTeam', teamId: newTeam.id },
        function(response) {
          if (response.success) {
            currentState.activeTeamId = newTeam.id;
            console.log('[POPUP_SCRIPT] Active team set to:', newTeam.id);
          } else {
            console.warn('[POPUP_SCRIPT] Failed to set active team:', response.error);
          }
        }
      );
      
      showPopupMessage(`已創建新團隊: ${teamName}`, "success");
    }
  });
  
  // 更新UI狀態
  function updateUIState() {
    if (currentState.isCapturing) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      teamSelect.disabled = true;
      statusDisplay.textContent = 'Recording...';
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

  // Add a debug function to help identify issues
  function debugAudioProcessing(audioBlob, base64Size, timestamp) {
    console.log(`[DEBUG] Processing audio chunk at ${timestamp}`);
    console.log(`[DEBUG] Audio blob size: ${audioBlob.size} bytes`);
    console.log(`[DEBUG] Base64 data size: ${base64Size} bytes`);
    
    // Check if audio is likely silent or very quiet
    if (audioBlob.size < 1000) { // Arbitrary small size check
      console.warn(`[DEBUG] Warning: Audio blob is very small (${audioBlob.size} bytes), might be silent`);
      showPopupMessage("Warning: Audio capture seems to be very quiet or silent", "error", 5000);
    }
  }

  
  // 處理音訊區塊並轉錄
  async function processAudioChunk(message) {
    try {
      console.log('處理音訊區塊:', message.timestamp);
      console.log('是否為最終區塊:', message.isFinal ? 'Yes' : 'No');
      
      // 獲取API金鑰和端點
      const apiKey = document.getElementById('apiKeyInput').value;
      const apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
      
      if (!apiKey) {
        console.error('沒有設置 OpenAI API 金鑰');
        showPopupMessage("Missing OpenAI API Key", "error", 3000);
        return;
      }
      
      // 確保 API 端點不以斜槓結尾
      const baseApiUrl = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
      console.log(`[POPUP_SCRIPT] Using API endpoint for transcription: ${baseApiUrl}`);
      
      // 建立音訊檔案
      const audioBlob = base64ToBlob(message.audioBase64, 'audio/webm');
      
      // Debug audio processing
      debugAudioProcessing(audioBlob, message.audioBase64.length, message.timestamp);
      
      if (audioBlob.size < 100) {
        console.error('Audio blob is too small, likely contains no audio data');
        showPopupMessage("Empty audio segment detected", "error", 3000);
        return;
      }
      
      // Update status display
      statusDisplay.textContent = 'Transcribing...';
      showPopupMessage("Transcribing audio...", "success", 2000);
      
      // 建立FormData
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      //formData.append('language', 'zh');
      
      // 調用API進行轉錄
      const response = await fetch(`${baseApiUrl}/audio/transcriptions`, {
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
        showPopupMessage(`Transcription failed: ${response.status} ${response.statusText}`, "error", 5000);
        statusDisplay.textContent = 'Ready';
        return;
      }
      
      const result = await response.json();
      
      // Check if transcription has content
      if (!result.text || result.text.trim() === '') {
        console.warn('Transcription returned empty text');
        showPopupMessage("Empty transcription returned - segment might be silent", "error", 3000);
        return;
      }
      
      // 保存轉錄結果
      const transcriptChunk = {
        timestamp: message.timestamp,
        text: result.text,
        isFinal: message.isFinal || false
      };
      
      transcriptChunks.push(transcriptChunk);
      
      // 更新顯示
      displayTranscript();
      statusDisplay.textContent = message.isFinal ? 'Ready' : 'Recording...';
      
      // 如果是最後一個區塊，保存到團隊記錄
      if (message.isFinal) {
        console.log('[POPUP_SCRIPT] 收到最終區塊，保存轉錄記錄到團隊');
        saveTranscriptToTeam();
      }
      
    } catch (error) {
      console.error('處理音訊區塊失敗:', error);
      showPopupMessage(`Audio processing error: ${error.message}`, "error", 5000);
      statusDisplay.textContent = 'Error';
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
        <div class="chunk-line">
          <span class="chunk-time">${formattedTime}</span>
          <span class="chunk-text">${chunk.text}</span>
        </div>
      `;
      
      transcriptContainer.appendChild(chunkElement);
    });
    
    // 自動滾動到底部
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
  }
  
  // 保存轉錄到團隊記錄
  function saveTranscriptToTeam() {
    try {
      const activeTeamId = currentState.activeTeamId;
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - 開始保存轉錄記錄');
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - activeTeamId:', activeTeamId);
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - currentState:', JSON.stringify(currentState));
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - transcriptChunks長度:', transcriptChunks.length);
      
      if (!activeTeamId) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: no active team ID');
        alert('無法保存轉錄：沒有選擇團隊！請先選擇或創建一個團隊。');
        return false;
      }
      
      if (transcriptChunks.length === 0) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: empty chunks');
        return false;
      }
      
      const fullText = transcriptChunks.map(chunk => chunk.text).join(' ');
      console.log('[POPUP_SCRIPT] Full transcript text:', fullText);
      
      // 獲取最新的團隊數據，避免覆蓋其他更改
      const latestTeams = JSON.parse(localStorage.getItem('teams')) || [];
      console.log('[POPUP_SCRIPT] 團隊數據從localStorage加載:', latestTeams.length > 0 ? '成功' : '空或失敗');
      
      // 找到當前團隊
      const teamIndex = latestTeams.findIndex(team => team.id === activeTeamId);
      console.log('[POPUP_SCRIPT] Team index for ID ' + activeTeamId + ':', teamIndex);
      
      if (teamIndex === -1) {
        console.warn('[POPUP_SCRIPT] Team not found with ID:', activeTeamId);
        alert(`無法找到ID為 ${activeTeamId} 的團隊，請重新選擇團隊。`);
        return false;
      }
      
      // 確保團隊有transcripts陣列
      if (!latestTeams[teamIndex].transcripts) {
        latestTeams[teamIndex].transcripts = [];
      }
      
      // 準備轉錄數據的深拷貝
      const transcriptChunksCopy = JSON.parse(JSON.stringify(transcriptChunks));
      
      // 添加新的轉錄記錄
      const newTranscript = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        text: fullText,
        chunks: transcriptChunksCopy
      };
      
      latestTeams[teamIndex].transcripts.push(newTranscript);
      
      // 保存更新後的團隊數據
      try {
        localStorage.setItem('teams', JSON.stringify(latestTeams));
        console.log('[POPUP_SCRIPT] 轉錄保存成功! 團隊:', latestTeams[teamIndex].name);
        console.log('[POPUP_SCRIPT] 該團隊現有轉錄數:', latestTeams[teamIndex].transcripts.length);
        
        // 更新本地activeTeams變量以保持一致
        activeTeams = latestTeams;
        
        // 顯示成功訊息
        showPopupMessage("轉錄已保存到團隊記錄", "success", 2000);
        return true;
      } catch (error) {
        console.error('[POPUP_SCRIPT] 保存到localStorage失敗:', error);
        alert('保存轉錄記錄失敗: ' + error.message);
        return false;
      }
    } catch (error) {
      console.error('[POPUP_SCRIPT] saveTranscriptToTeam錯誤:', error);
      alert('保存轉錄過程中發生錯誤: ' + error.message);
      return false;
    }
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
  const downloadFiles = localStorage.getItem('download_audio_files') === 'true';
  // const savedModel = localStorage.getItem('openai_model') || ''; // We'll populate models after testing

  document.getElementById('apiKeyInput').value = savedApiKey;
  document.getElementById('apiEndpointInput').value = savedApiEndpoint;
  document.getElementById('downloadFilesCheckbox').checked = downloadFiles;
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
  const downloadFiles = document.getElementById('downloadFilesCheckbox').checked;

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
      if (!connectionSucccdessful) {
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
  localStorage.setItem('download_audio_files', downloadFiles);
  
  showPopupMessage('Settings saved successfully!', 'success');
  console.log('Settings saved:', { apiKey, apiEndpoint, downloadFiles, model: localStorage.getItem('openai_model') });
}); 