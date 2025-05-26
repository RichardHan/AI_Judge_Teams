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
  let transcriptSaved = false; // 防止重複保存轉錄記錄
  
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
    console.log('[POPUP_SCRIPT] Initial getCaptureState response:', JSON.stringify(response));
    if (response) {
        currentState.isCapturing = response.isCapturing;
        currentState.activeTeamId = response.activeTeamId;
        
        // 恢復轉錄內容
        if (response.transcriptChunks && response.transcriptChunks.length > 0) {
          transcriptChunks = [...response.transcriptChunks];
          transcriptSaved = false; // 重置保存狀態，因為這是恢復的內容
          console.log('[POPUP_SCRIPT] Restored transcript chunks from background:', transcriptChunks.length);
          displayTranscript();
        }
    } else {
        console.warn('[POPUP_SCRIPT] Initial getCaptureState got no response or undefined response. currentState remains default.');
        // currentState remains { isCapturing: false, activeTeamId: null }
    }
    updateUIState();
    // Potentially re-load or re-evaluate team select if state indicates capture but no teamID
    // or if team select needs to reflect the activeTeamId from background.
    // Calling loadTeamSelect again here might be useful if initial loadTeamSelect ran before this callback.
    // However, loadTeamSelect is also called just before this. Consider the timing.
    // For now, ensure updateUIState correctly reflects the fetched state.
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
    console.log('[POPUP_SCRIPT] StartBtn: selectedTeamId from teamSelect.value:', selectedTeamId);
    if (!selectedTeamId) {
      alert('Please select or create a team first.');
      console.warn('[POPUP_SCRIPT] No team selected.');
      return;
    }
    
    // 清空轉錄文本顯示
    transcriptContainer.innerHTML = '';
    transcriptChunks = [];
    transcriptSaved = false; // 重置保存狀態
    
    // 通知 background script 清除轉錄記錄
    chrome.runtime.sendMessage({ action: 'clearTranscripts' });
    
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
          console.log('[POPUP_SCRIPT] StartBtn Callback: Capture started. currentState:', JSON.stringify(currentState), 'selectedTeamId was:', selectedTeamId);
        } else {
          console.error('開始捕獲失敗:', response ? response.error : 'No response or error field missing');
          alert('Failed to start capture: ' + (response ? response.error : 'Unknown error'));
        }
      }
    );
  });
  
  // 停止捕獲按鈕點擊事件
  stopBtn.addEventListener('click', function() {
    console.log('[POPUP_SCRIPT] StopBtn: Clicked. Current currentState:', JSON.stringify(currentState));
    showPopupMessage("正在停止錄音...", "success", 2000);
    const teamIdForSaving = currentState.activeTeamId; // Capture ID immediately
    console.log('[POPUP_SCRIPT] StopBtn: teamIdForSaving is:', teamIdForSaving);
    const showHistoryBtn = document.getElementById('showHistoryBtn');
    showHistoryBtn.disabled = true; // Disable history button

    // 確保即使background.js未發送final chunk，我們也會存儲轉錄
    const forceSaveTranscript = function(currentTeamId) { // Pass teamId
      if (transcriptChunks.length > 0 && !transcriptSaved) {
        console.log('[POPUP_SCRIPT] 強制保存轉錄記錄，轉錄塊數量:', transcriptChunks.length);
        // 標記最後一個區塊為final
        transcriptChunks[transcriptChunks.length - 1].isFinal = true;
        // 保存轉錄
        if (saveTranscriptToTeam(currentTeamId)) { // Pass teamId to save function
          transcriptSaved = true; // 標記已保存
          console.log('[POPUP_SCRIPT] 成功保存轉錄記錄');
          showPopupMessage("轉錄已保存到歷史記錄", "success", 3000);
        } else {
          console.error('[POPUP_SCRIPT] 保存轉錄記錄失敗');
          showPopupMessage("保存轉錄失敗，請查看控制台", "error", 3000);
        }
      } else if (transcriptSaved) {
        console.log('[POPUP_SCRIPT] 轉錄已經保存過了，跳過重複保存');
        showPopupMessage("轉錄已經保存", "success", 2000);
      } else {
        console.warn('[POPUP_SCRIPT] 沒有轉錄內容可保存');
        showPopupMessage("無轉錄內容可保存", "error", 3000);
      }
      showHistoryBtn.disabled = false; // Re-enable history button
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
            forceSaveTranscript(teamIdForSaving); // Pass captured ID
            
            // 保存完成後清除轉錄內容（只有在停止錄音時才清除）
            setTimeout(function() {
              transcriptChunks = [];
              transcriptContainer.innerHTML = '';
              transcriptSaved = false; // 重置保存狀態
              chrome.runtime.sendMessage({ action: 'clearTranscripts' });
              console.log('[POPUP_SCRIPT] Cleared transcript content after saving');
            }, 1000);
          } else {
            console.warn('[POPUP_SCRIPT] 停止錄音後沒有轉錄塊');
            showPopupMessage("未檢測到有效轉錄", "error", 3000);
            showHistoryBtn.disabled = false; // Re-enable if no chunks
          }
        }, 3000); // 等待3秒確保所有API回應都已處理
      } else {
        console.error('[POPUP_SCRIPT] 停止捕獲失敗:', response ? response.error : '沒有回應');
        alert('停止錄音失敗: ' + (response ? response.error : '未知錯誤'));
        
        // 即使停止失敗，也嘗試保存現有轉錄
        if (transcriptChunks.length > 0) {
          forceSaveTranscript(teamIdForSaving); // Pass captured ID
        } else {
          showHistoryBtn.disabled = false; // Also re-enable if stop failed and no chunks
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
    console.log('Popup received message:', message, 'Sender:', sender);
    
    switch (message.action) {
      case 'captureStateChanged':
        console.log('[POPUP_SCRIPT] Received captureStateChanged. Message state:', JSON.stringify(message.state));
        // Ensure we update both isCapturing and activeTeamId if provided
        currentState.isCapturing = message.state.isCapturing;
        if (message.state.hasOwnProperty('activeTeamId')) {
            currentState.activeTeamId = message.state.activeTeamId;
            console.log('[POPUP_SCRIPT] captureStateChanged: Updated currentState.activeTeamId to:', currentState.activeTeamId);
        } else if (!message.state.isCapturing) {
            // If capturing stopped and no activeTeamId was sent, we might want to preserve the existing one
            // or explicitly nullify it if that's the design. For now, let's log this case.
            console.warn('[POPUP_SCRIPT] captureStateChanged: isCapturing is false, but no activeTeamId received in message.state. currentState.activeTeamId remains:', currentState.activeTeamId);
        }
        updateUIState();
        break;
        
      case 'audioChunk':
        // 處理收到的音訊區塊
        processAudioChunk(message);
        break;
        
      case 'transcriptUpdated':
        // 接收來自 background script 的轉錄更新
        console.log('[POPUP_SCRIPT] Received transcriptUpdated from background:', message.transcriptChunks.length);
        transcriptChunks = [...message.transcriptChunks];
        displayTranscript();
        break;
        
      case 'screenshotAnalyzed':
        // 接收來自 background script 的截圖分析結果
        console.log('[POPUP_SCRIPT] Received screenshotAnalyzed from background:', message.data);
        // 截圖分析結果已經被 background script 添加到 transcriptChunks 中
        // 這裡只需要更新顯示
        displayTranscript();
        showPopupMessage("Screenshot analyzed and added to transcript", "success", 2000);
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
      
      // 添加語言參數（如果用戶有選擇的話）
      const selectedLanguage = document.getElementById('languageSelect').value;
      if (selectedLanguage) {
        formData.append('language', selectedLanguage);
        console.log(`[POPUP_SCRIPT] Using language: ${selectedLanguage}`);
      } else {
        console.log('[POPUP_SCRIPT] Using auto-detect language');
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
      
      // 通知 background script 保存轉錄片段
      chrome.runtime.sendMessage({
        action: 'transcriptComplete',
        transcript: transcriptChunk
      });
      
      // 更新顯示
      displayTranscript();
      statusDisplay.textContent = message.isFinal ? 'Ready' : 'Recording...';
      
      // 如果是最後一個區塊，保存到團隊記錄
      if (message.isFinal && !transcriptSaved) {
        console.log('[POPUP_SCRIPT] 收到最終區塊，保存轉錄記錄到團隊');
        if (saveTranscriptToTeam(currentState.activeTeamId)) {
          transcriptSaved = true; // 標記已保存
          console.log('[POPUP_SCRIPT] 轉錄已保存，設置 transcriptSaved = true');
        }
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
    
    // 反轉數組順序，讓最新的轉錄顯示在最上面
    const reversedChunks = [...transcriptChunks].reverse();
    
    reversedChunks.forEach((chunk, index) => {
      const chunkElement = document.createElement('div');
      
      // Apply 'transcript-chunk' to all, removing specific 'screenshot-chunk' styling differentiation
      chunkElement.className = 'transcript-chunk'; 
      
      // 為最新的轉錄項目添加特殊樣式
      if (index === 0) {
        chunkElement.classList.add('latest-transcript');
      }
      
      // 格式化時間戳
      const date = new Date(chunk.timestamp);
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      
      // 根據類型顯示不同的內容
      if (chunk.type === 'screenshot') {
        chunkElement.innerHTML = `
          <div class="chunk-line">
            <span class="chunk-time">${formattedTime}</span>
            <span class="chunk-type">📸</span>
            <span class="chunk-text">${chunk.analysis}</span>
          </div>
        `;
      } else {
        chunkElement.innerHTML = `
          <div class="chunk-line">
            <span class="chunk-time">${formattedTime}</span>
            <span class="chunk-text">${chunk.text || chunk.analysis}</span>
          </div>
        `;
      }
      
      transcriptContainer.appendChild(chunkElement);
    });
    
    // 自動滾動到頂部，讓用戶看到最新內容
    transcriptContainer.scrollTop = 0;
  }
  
  // 保存轉錄到團隊記錄
  function saveTranscriptToTeam(teamIdToSave) {
    try {
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - 開始保存轉錄記錄');
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - teamIdToSave:', teamIdToSave);
      console.log('[POPUP_SCRIPT] saveTranscriptToTeam - transcriptChunks長度:', transcriptChunks.length);
      
      if (!teamIdToSave) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: no team ID provided for saving');
        alert('無法保存轉錄：沒有提供團隊ID進行保存！');
        return false;
      }
      
      if (transcriptChunks.length === 0) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: empty chunks');
        return false;
      }
      
      const fullText = transcriptChunks.map(chunk => {
        if (chunk.type === 'screenshot') {
          return `[📸 ${chunk.analysis}]`;
        }
        return chunk.text || chunk.analysis || '';
      }).join(' ');
      console.log('[POPUP_SCRIPT] Full transcript text:', fullText);
      
      // 獲取最新的團隊數據，避免覆蓋其他更改
      const latestTeams = JSON.parse(localStorage.getItem('teams')) || [];
      console.log('[POPUP_SCRIPT] 團隊數據從localStorage加載:', latestTeams.length > 0 ? '成功' : '空或失敗');
      
      // 找到當前團隊
      const teamIndex = latestTeams.findIndex(team => team.id === teamIdToSave);
      console.log('[POPUP_SCRIPT] Team index for ID ' + teamIdToSave + ':', teamIndex);
      
      if (teamIndex === -1) {
        console.warn('[POPUP_SCRIPT] Team not found with ID:', teamIdToSave);
        alert(`無法找到ID為 ${teamIdToSave} 的團隊，請重新選擇團隊。`);
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
  
  // 語言選擇器事件監聽器
  document.getElementById('languageSelect').addEventListener('change', function() {
    const selectedLanguage = this.value;
    localStorage.setItem('transcription_language', selectedLanguage);
    console.log('[POPUP_SCRIPT] Language preference saved:', selectedLanguage || 'Auto');
    showPopupMessage(`Language set to: ${selectedLanguage || 'Auto-detect'}`, "success", 2000);
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

// Default AI Judge prompts
const DEFAULT_JUDGE_PROMPTS = {
  judge1: `You are Judge 1, a business-focused evaluator with expertise in strategic thinking and scaling technology solutions globally. You value innovation that creates real market impact.
 
 Your Focus:
 - Business potential and scalability
 - Customer problem-solving effectiveness  
 - Market differentiation opportunity
 - Long-term viability
 
 Scoring (1-100):
 - Practicality (30%): Can this be implemented and maintained in real operations?
 - Technical Implementation (30%): Is the solution well-architected and innovative?
 - Business Value & Impact (40%): What's the potential ROI and market impact?
 
 Evaluation Style: Challenge teams on business model, market strategy, and global scaling potential.`,
 
  judge2: `You are Judge 2, a technical expert with deep engineering experience. You focus on code quality, system architecture, and engineering excellence.
 
 Your Focus:
 - Technical depth and implementation quality
 - Code architecture and best practices
 - Innovation in technical approach
 - Production readiness
 
 Scoring (1-100):
 - Practicality (30%): Is this technically feasible for production deployment?
 - Technical Implementation (30%): Code quality, security, and scalability considerations
 - Business Value & Impact (40%): Development efficiency and operational benefits
 
 Evaluation Style: Deep dive into technical architecture, performance, and engineering fundamentals.`,
 
  judge3: `You are Judge 3, a product strategist with experience across development, sales, and marketing. You focus on user experience and platform integration.
 
 Your Focus:
 - Product-market fit
 - User experience and usability
 - Platform integration potential
 - Customer-centric design
 
 Scoring (1-100):
 - Practicality (30%): How well does this integrate with existing systems and workflows?
 - Technical Implementation (30%): Clean design, modularity, and forward-thinking architecture
 - Business Value & Impact (40%): Customer success potential and ecosystem value
 
 Evaluation Style: Focus on customer personas, use cases, and platform ecosystem benefits.`
 };

// Function to load saved settings
function loadSettings() {
  const savedApiKey = localStorage.getItem('openai_api_key') || '';
  const savedApiEndpoint = localStorage.getItem('openai_api_endpoint') || 'https://api.openai.com/v1';
  const downloadFiles = localStorage.getItem('download_audio_files') === 'true';
  const savedLanguage = localStorage.getItem('transcription_language') || '';
  const savedScreenshotDetail = localStorage.getItem('screenshot_detail_level') || 'medium';
  
  // Load AI Judge settings
  const enableJudge1 = localStorage.getItem('enable_judge1_judge') !== 'false';
  const enableJudge2 = localStorage.getItem('enable_judge2_judge') !== 'false';
  const enableJudge3 = localStorage.getItem('enable_judge3_judge') !== 'false';
  const judge1Prompt = localStorage.getItem('judge1_judge_prompt') || DEFAULT_JUDGE_PROMPTS.judge1;
  const judge2Prompt = localStorage.getItem('judge2_judge_prompt') || DEFAULT_JUDGE_PROMPTS.judge2;
  const judge3Prompt = localStorage.getItem('judge3_judge_prompt') || DEFAULT_JUDGE_PROMPTS.judge3;

  document.getElementById('apiKeyInput').value = savedApiKey;
  document.getElementById('apiEndpointInput').value = savedApiEndpoint;
  document.getElementById('downloadFilesCheckbox').checked = downloadFiles;
  document.getElementById('languageSelect').value = savedLanguage;
  document.getElementById('screenshotDetailSelect').value = savedScreenshotDetail;
  
  // Set AI Judge settings
  document.getElementById('enableJudge1').checked = enableJudge1;
  document.getElementById('enableJudge2').checked = enableJudge2;
  document.getElementById('enableJudge3').checked = enableJudge3;
  document.getElementById('judge1Prompt').value = judge1Prompt;
  document.getElementById('judge2Prompt').value = judge2Prompt;
  document.getElementById('judge3Prompt').value = judge3Prompt;
  
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
  const screenshotModelSelect = document.getElementById('screenshotModelSelect');
  
  const apiKey = apiKeyInput.value.trim();
  const apiEndpoint = apiEndpointInput.value.trim() || 'https://api.openai.com/v1'; // Default if empty
  
  if (!apiKey) {
    if (showMessage) showPopupMessage('Please enter your OpenAI API Key.', 'error');
    apiKeyInput.focus();
    return false;
  }
  
  modelSelect.innerHTML = '<option value="">Testing connection...</option>';
  screenshotModelSelect.innerHTML = '<option value="">Testing connection...</option>';
  modelSelect.disabled = true;
  screenshotModelSelect.disabled = true;
  
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
    screenshotModelSelect.innerHTML = ''; // Clear previous options
    
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

      // Filter models for screenshot analysis (vision models)
      const visionModels = filteredModels.filter(model => 
        model.id.includes('vision') || 
        model.id.includes('gpt-4o') || 
        model.id.includes('gpt-4-turbo') ||
        model.id.startsWith('gpt-4')
      );

      if (filteredModels.length === 0) {
        modelSelect.innerHTML = '<option value="">No compatible models found.</option>';
        screenshotModelSelect.innerHTML = '<option value="">No compatible models found.</option>';
        if (showMessage) showPopupMessage('Connection successful, but no compatible models found.', 'error');
      } else {
        // Populate AI Judge model selector (all models)
        filteredModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          modelSelect.appendChild(option);
        });
        
        // Populate Screenshot model selector (vision models only)
        if (visionModels.length > 0) {
          visionModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            screenshotModelSelect.appendChild(option);
          });
        } else {
          // If no vision models found, add all models but with a note
          filteredModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id + (model.id.includes('gpt-4') ? '' : ' (may not support images)');
            screenshotModelSelect.appendChild(option);
          });
        }
        
        // Try to select previously saved models
        const savedModel = localStorage.getItem('openai_model');
        const savedScreenshotModel = localStorage.getItem('openai_screenshot_model');
        
        if (savedModel && modelSelect.querySelector(`option[value="${savedModel}"]`)) {
            modelSelect.value = savedModel;
        }
        if (savedScreenshotModel && screenshotModelSelect.querySelector(`option[value="${savedScreenshotModel}"]`)) {
            screenshotModelSelect.value = savedScreenshotModel;
        } else if (visionModels.length > 0) {
            // Default to first vision model for screenshots
            screenshotModelSelect.value = visionModels[0].id;
        }
        
        if (showMessage) showPopupMessage('Connection successful! Models loaded.', 'success');
      }
    } else {
      modelSelect.innerHTML = '<option value="">No models found.</option>';
      screenshotModelSelect.innerHTML = '<option value="">No models found.</option>';
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
    screenshotModelSelect.disabled = false;
  }
}

// Event listener for Test Connection button
document.getElementById('testConnectionBtn').addEventListener('click', () => testAPIConnection(true));

// Event listener for Save Settings button
document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  const selectedModel = document.getElementById('modelSelect').value;
  const selectedScreenshotModel = document.getElementById('screenshotModelSelect').value;
  const screenshotDetailLevel = document.getElementById('screenshotDetailSelect').value;
  const downloadFiles = document.getElementById('downloadFilesCheckbox').checked;
  
  // Get AI Judge settings
  const enableJudge1 = document.getElementById('enableJudge1').checked;
  const enableJudge2 = document.getElementById('enableJudge2').checked;
  const enableJudge3 = document.getElementById('enableJudge3').checked;
  const judge1Prompt = document.getElementById('judge1Prompt').value.trim();
  const judge2Prompt = document.getElementById('judge2Prompt').value.trim();
  const judge3Prompt = document.getElementById('judge3Prompt').value.trim();

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
  localStorage.setItem('openai_screenshot_model', selectedScreenshotModel);
  localStorage.setItem('screenshot_detail_level', screenshotDetailLevel);
  localStorage.setItem('download_audio_files', downloadFiles.toString());
  localStorage.setItem('transcription_language', document.getElementById('languageSelect').value);
  
  // Save AI Judge settings
  localStorage.setItem('enable_judge1_judge', enableJudge1);
  localStorage.setItem('enable_judge2_judge', enableJudge2);
  localStorage.setItem('enable_judge3_judge', enableJudge3);
  localStorage.setItem('judge1_judge_prompt', judge1Prompt || DEFAULT_JUDGE_PROMPTS.judge1);
  localStorage.setItem('judge2_judge_prompt', judge2Prompt || DEFAULT_JUDGE_PROMPTS.judge2);
  localStorage.setItem('judge3_judge_prompt', judge3Prompt || DEFAULT_JUDGE_PROMPTS.judge3);
  
  showPopupMessage('Settings saved successfully!', 'success');
  console.log('Settings saved:', { 
    apiKey, 
    apiEndpoint, 
    downloadFiles, 
    model: localStorage.getItem('openai_model'),
    aiJudges: { enableJudge1, enableJudge2, enableJudge3 }
  });
}); 