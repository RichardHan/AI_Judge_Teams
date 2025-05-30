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

// 检查扩展能力并在界面上显示状态
function checkExtensionCapabilities() {
  console.log('[POPUP_SCRIPT] Checking extension capabilities...');
  
  const statusDisplay = document.getElementById('status');
  if (!statusDisplay) return;
  
  // 检查音频捕获能力
  const hasAudioCapture = chrome.tabCapture && typeof chrome.tabCapture.capture === 'function';
  
  // 检查截图能力
  const hasScreenCapture = chrome.tabs && typeof chrome.tabs.captureVisibleTab === 'function';
  
  if (hasAudioCapture && hasScreenCapture) {
    console.log('[POPUP_SCRIPT] All capabilities available');
    showPopupMessage("✅ Extension fully functional", "success", 3000);
  } else if (!hasAudioCapture && hasScreenCapture) {
    console.warn('[POPUP_SCRIPT] Audio capture not available, screenshots only');
    showPopupMessage("⚠️ Audio transcription unavailable - screenshots only", "error", 5000);
    statusDisplay.textContent = 'Limited Mode';
    statusDisplay.style.color = 'orange';
  } else if (hasAudioCapture && !hasScreenCapture) {
    console.warn('[POPUP_SCRIPT] Screenshot capture not available, audio only');
    showPopupMessage("⚠️ Screenshots unavailable - audio only", "error", 5000);
  } else {
    console.error('[POPUP_SCRIPT] Both audio and screenshot capabilities unavailable');
    showPopupMessage("❌ Extension capabilities unavailable - please check permissions", "error", 8000);
    statusDisplay.textContent = 'Disabled';
    statusDisplay.style.color = 'red';
  }
}

// 頁面載入後執行的初始化函數
document.addEventListener('DOMContentLoaded', function() {
  console.log('[POPUP_SCRIPT] 頁面載入完成，初始化應用');
  
  // 检查扩展状态并显示能力
  checkExtensionCapabilities();
  
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
    showPopupMessage("正在停止錄音並等待所有轉錄完成...", "success", 3000);
    
    chrome.runtime.sendMessage({ action: 'stopCapture' }, function(response) {
      console.log('[POPUP_SCRIPT] 停止錄音響應:', response);
      
      if (response && response.success) {
        // 更新UI
        currentState.isCapturing = false;
        updateUIState();
        
        // 顯示等待消息
        showPopupMessage("錄音已停止，等待所有轉錄處理完成...", "success", 5000);
        
        // 延遲後清除轉錄內容顯示（background會自動保存）
        setTimeout(function() {
          transcriptChunks = [];
          transcriptContainer.innerHTML = '';
          transcriptSaved = false; // 重置保存狀態
          chrome.runtime.sendMessage({ action: 'clearTranscripts' });
          console.log('[POPUP_SCRIPT] Cleared transcript content display after stopping');
          showPopupMessage("所有轉錄已處理完成並保存到團隊記錄", "success", 3000);
        }, 6000); // 比background的延遲稍長一點
        
      } else {
        console.error('[POPUP_SCRIPT] 停止捕獲失敗:', response ? response.error : '沒有回應');
        showPopupMessage('停止錄音失敗: ' + (response ? response.error : '未知錯誤'), "error", 5000);
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
    const enableScreenshotAnalysis = localStorage.getItem('enable_screenshot_analysis') !== 'false';
    
    if (currentState.isCapturing) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      teamSelect.disabled = true;
      statusDisplay.textContent = `Recording... ${enableScreenshotAnalysis ? '📸' : ''}`;
      statusDisplay.style.color = 'red';
    } else {
      startBtn.disabled = false;
      stopBtn.disabled = true;
      teamSelect.disabled = false;
      statusDisplay.textContent = `Ready ${enableScreenshotAnalysis ? '📸' : ''}`;
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
        
      case 'transcriptUpdated':
        // 接收來自 background script 的轉錄更新
        console.log('[POPUP_SCRIPT] Received transcriptUpdated from background:', message.transcriptChunks.length);
        transcriptChunks = [...message.transcriptChunks];
        displayTranscript();
        // Update status to show transcription is working
        if (currentState.isCapturing && statusDisplay) {
          const enableScreenshotAnalysis = localStorage.getItem('enable_screenshot_analysis') !== 'false';
          statusDisplay.textContent = `Recording... ${enableScreenshotAnalysis ? '📸' : ''} 🎙️`;
          statusDisplay.style.color = 'red';
        }
        break;
        
      case 'screenshotAnalyzed':
        // 接收來自 background script 的截圖分析結果
        console.log('[POPUP_SCRIPT] Received screenshotAnalyzed from background:', message.data);
        // 截圖分析結果已經被 background script 添加到 transcriptChunks 中
        // 這裡只需要更新顯示
        displayTranscript();
        showPopupMessage("Screenshot analyzed and added to transcript", "success", 2000);
        break;
        
      case 'extensionDisabled':
        // 处理扩展被禁用的情况
        console.error('[POPUP_SCRIPT] Extension disabled error:', message.error);
        showPopupMessage("⚠️ Extension may be disabled - audio transcription unavailable", "error", 8000);
        statusDisplay.textContent = 'Extension Error';
        statusDisplay.style.color = 'red';
        break;
        
      case 'audioCaptureError':
        // 处理音频捕获错误
        console.error('[POPUP_SCRIPT] Audio capture error:', message.error);
        showPopupMessage("🎤 Audio capture failed - check extension permissions", "error", 6000);
        break;
        
      case 'screenshotAnalysisError':
        // 处理截图分析错误
        console.error('[POPUP_SCRIPT] Screenshot analysis error:', message.error);
        showPopupMessage(`📸 Screenshot analysis: ${message.error}`, "error", 5000);
        break;
        
      case 'transcriptionError':
        // 处理转录错误
        console.error('[POPUP_SCRIPT] Transcription error:', message.error);
        showPopupMessage(`🎙️ Transcription: ${message.error}`, "error", 5000);
        break;
        
      case 'saveTranscriptToTeam':
        // 处理来自background的保存转录请求
        console.log('[POPUP_SCRIPT] Received saveTranscriptToTeam request from background');
        console.log('[POPUP_SCRIPT] Message details:', JSON.stringify(message, null, 2));
        const saveResult = saveTranscriptToTeamFromBackground(message.teamId, message.transcriptChunks, message.fullText);
        if (saveResult) {
          console.log('[POPUP_SCRIPT] Transcript saved successfully from background request');
          showPopupMessage("轉錄已保存到團隊記錄", "success", 3000);
          sendResponse({ success: true, message: 'Transcript saved successfully' });
        } else {
          console.error('[POPUP_SCRIPT] Failed to save transcript from background request');
          showPopupMessage("保存轉錄失敗", "error", 3000);
          sendResponse({ success: false, error: 'Failed to save transcript' });
        }
        break;
        
      case 'audioReroutingSuccess':
        // 处理音频重新路由成功
        console.log('[POPUP_SCRIPT] Audio rerouting successful:', message.message);
        showPopupMessage("🔊 Audio capture active - you should hear tab audio normally", "success", 4000);
        break;
        
      case 'audioReroutingWarning':
        // 处理音频重新路由警告
        console.warn('[POPUP_SCRIPT] Audio rerouting warning:', message.message);
        showPopupMessage("⚠️ Audio capture active but tab audio may be muted (this is normal)", "error", 5000);
        break;
    }
    
    return true;
  });

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
  
  // 從background保存轉錄到團隊記錄
  function saveTranscriptToTeamFromBackground(teamId, transcriptChunks, fullText) {
    try {
      console.log('[POPUP_SCRIPT] saveTranscriptToTeamFromBackground - Starting to save transcript');
      console.log('[POPUP_SCRIPT] Team ID:', teamId);
      console.log('[POPUP_SCRIPT] Transcript chunks length:', transcriptChunks.length);
      
      if (!teamId) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: no team ID provided');
        return false;
      }
      
      if (!transcriptChunks || transcriptChunks.length === 0) {
        console.warn('[POPUP_SCRIPT] Cannot save transcript: empty chunks');
        return false;
      }
      
      // 獲取最新的團隊數據，避免覆蓋其他更改
      const latestTeams = JSON.parse(localStorage.getItem('teams')) || [];
      console.log('[POPUP_SCRIPT] Teams loaded from localStorage:', latestTeams.length > 0 ? '成功' : '空或失敗');
      
      // 找到當前團隊
      const teamIndex = latestTeams.findIndex(team => team.id === teamId);
      console.log('[POPUP_SCRIPT] Team index for ID ' + teamId + ':', teamIndex);
      
      if (teamIndex === -1) {
        console.warn('[POPUP_SCRIPT] Team not found with ID:', teamId);
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
        console.log('[POPUP_SCRIPT] Transcript saved successfully! Team:', latestTeams[teamIndex].name);
        console.log('[POPUP_SCRIPT] Team now has transcripts count:', latestTeams[teamIndex].transcripts.length);
        
        // 更新本地activeTeams變量以保持一致
        activeTeams = latestTeams;
        
        return true;
      } catch (error) {
        console.error('[POPUP_SCRIPT] Failed to save to localStorage:', error);
        return false;
      }
    } catch (error) {
      console.error('[POPUP_SCRIPT] saveTranscriptToTeamFromBackground error:', error);
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
  const enableScreenshotAnalysis = localStorage.getItem('enable_screenshot_analysis') !== 'false'; // Default to true
  const enableAudioRerouting = localStorage.getItem('enable_audio_rerouting') !== 'false'; // Default to true
  
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
  document.getElementById('enableScreenshotAnalysis').checked = enableScreenshotAnalysis;
  document.getElementById('enableAudioRerouting').checked = enableAudioRerouting;
  
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

// Event listener for Test Screenshot button
document.getElementById('testScreenshotBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const screenshotModel = document.getElementById('screenshotModelSelect').value;
  const enableScreenshotAnalysis = document.getElementById('enableScreenshotAnalysis').checked;
  
  if (!enableScreenshotAnalysis) {
    showPopupMessage('Screenshot analysis is disabled. Please enable it first.', 'error');
    return;
  }
  
  if (!apiKey) {
    showPopupMessage('Please configure API key first.', 'error');
    return;
  }
  
  if (!screenshotModel) {
    showPopupMessage('Please select a screenshot model first.', 'error');
    return;
  }
  
  showPopupMessage('Testing screenshot capture and analysis...', 'success');
  
  try {
    // Send message to background script to test screenshot
    chrome.runtime.sendMessage({ action: 'testScreenshot' }, function(response) {
      if (response && response.success) {
        showPopupMessage('Screenshot test successful! Check the transcript for analysis.', 'success', 5000);
      } else {
        showPopupMessage(`Screenshot test failed: ${response ? response.error : 'Unknown error'}`, 'error', 5000);
      }
    });
  } catch (error) {
    showPopupMessage(`Screenshot test error: ${error.message}`, 'error', 5000);
  }
});

// Event listener for Audio Diagnostic button
document.getElementById('testAudioBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  
  console.log('[POPUP_SCRIPT] Running audio transcription diagnostic...');
  
  // Check basic settings
  if (!apiKey) {
    showPopupMessage('Please configure API key first.', 'error');
    return;
  }
  
  // Check Chrome API availability
  if (!chrome.tabCapture || typeof chrome.tabCapture.capture !== 'function') {
    showPopupMessage('❌ Chrome tabCapture API not available - check extension permissions', 'error', 8000);
    return;
  }
  
  // Check MediaRecorder support
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') {
    showPopupMessage('❌ MediaRecorder not supported in this browser', 'error', 8000);
    return;
  }
  
  console.log('[POPUP_SCRIPT] Checking MediaRecorder support:');
  const supportedTypes = ['audio/webm', 'audio/ogg', 'audio/mp3'];
  supportedTypes.forEach(type => {
    const supported = MediaRecorder.isTypeSupported(type);
    console.log(`[POPUP_SCRIPT] ${type}: ${supported ? 'Supported' : 'Not supported'}`);
  });
  
  // Test API connection for audio transcription
  try {
    showPopupMessage('Testing audio transcription API...', 'success');
    
    const response = await fetch(`${apiEndpoint}/models`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    const hasWhisper = data.data && data.data.some(model => model.id.includes('whisper'));
    
    if (hasWhisper) {
      showPopupMessage('✅ Audio transcription API connection successful', 'success', 5000);
    } else {
      showPopupMessage('⚠️ API connected but no Whisper model found', 'error', 5000);
    }
    
    // Test audio capture capability
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        showPopupMessage('❌ No active tab found for audio capture test', 'error');
        return;
      }
      
      chrome.tabCapture.capture({ audio: true, video: false }, stream => {
        if (!stream) {
          showPopupMessage('❌ Failed to capture audio - check if tab has audio or permissions', 'error', 8000);
          return;
        }
        
        console.log('[POPUP_SCRIPT] Test audio capture successful');
        
        // Check audio tracks
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          showPopupMessage('❌ No audio tracks found in captured stream', 'error', 8000);
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        
        console.log(`[POPUP_SCRIPT] Found ${audioTracks.length} audio tracks`);
        audioTracks.forEach((track, index) => {
          console.log(`[POPUP_SCRIPT] Track ${index}: enabled=${track.enabled}, muted=${track.muted}, readyState=${track.readyState}`);
        });
        
        // Test MediaRecorder with the stream
        try {
          const testRecorder = new MediaRecorder(stream);
          console.log('[POPUP_SCRIPT] MediaRecorder created successfully');
          
          let hasAudio = false;
          testRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              hasAudio = true;
              console.log(`[POPUP_SCRIPT] Test recording received ${e.data.size} bytes of audio data`);
            }
          };
          
          testRecorder.onstop = () => {
            if (hasAudio) {
              showPopupMessage('✅ Audio capture test successful - ready for transcription', 'success', 5000);
            } else {
              showPopupMessage('❌ Audio capture test failed - no audio data recorded', 'error', 8000);
            }
            stream.getTracks().forEach(track => track.stop());
          };
          
          testRecorder.start();
          setTimeout(() => {
            testRecorder.stop();
          }, 2000); // Record for 2 seconds
          
        } catch (error) {
          showPopupMessage(`❌ MediaRecorder error: ${error.message}`, 'error', 8000);
          stream.getTracks().forEach(track => track.stop());
        }
      });
    });
    
  } catch (error) {
    console.error('[POPUP_SCRIPT] Audio diagnostic error:', error);
    showPopupMessage(`❌ Audio transcription API test failed: ${error.message}`, 'error', 8000);
  }
});

// Event listener for Save Settings button
document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  const selectedModel = document.getElementById('modelSelect').value;
  const selectedScreenshotModel = document.getElementById('screenshotModelSelect').value;
  const screenshotDetailLevel = document.getElementById('screenshotDetailSelect').value;
  const downloadFiles = document.getElementById('downloadFilesCheckbox').checked;
  const enableScreenshotAnalysis = document.getElementById('enableScreenshotAnalysis').checked;
  const enableAudioRerouting = document.getElementById('enableAudioRerouting').checked;
  
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
  localStorage.setItem('enable_screenshot_analysis', enableScreenshotAnalysis.toString());
  localStorage.setItem('enable_audio_rerouting', enableAudioRerouting.toString());
  localStorage.setItem('download_audio_files', downloadFiles.toString());
  localStorage.setItem('transcription_language', document.getElementById('languageSelect').value);
  
  // Save AI Judge settings
  localStorage.setItem('enable_judge1_judge', enableJudge1);
  localStorage.setItem('enable_judge2_judge', enableJudge2);
  localStorage.setItem('enable_judge3_judge', enableJudge3);
  localStorage.setItem('judge1_judge_prompt', judge1Prompt || DEFAULT_JUDGE_PROMPTS.judge1);
  localStorage.setItem('judge2_judge_prompt', judge2Prompt || DEFAULT_JUDGE_PROMPTS.judge2);
  localStorage.setItem('judge3_judge_prompt', judge3Prompt || DEFAULT_JUDGE_PROMPTS.judge3);
  
  // Also save to chrome.storage.local for background script access
  const settingsToStore = {
    'openai_api_key': apiKey,
    'openai_api_endpoint': apiEndpoint,
    'openai_model': localStorage.getItem('openai_model'),
    'openai_screenshot_model': selectedScreenshotModel,
    'screenshot_detail_level': screenshotDetailLevel,
    'enable_screenshot_analysis': enableScreenshotAnalysis.toString(),
    'enable_audio_rerouting': enableAudioRerouting.toString(),
    'download_audio_files': downloadFiles.toString(),
    'transcription_language': document.getElementById('languageSelect').value,
    'enable_judge1_judge': enableJudge1,
    'enable_judge2_judge': enableJudge2,
    'enable_judge3_judge': enableJudge3,
    'judge1_judge_prompt': judge1Prompt || DEFAULT_JUDGE_PROMPTS.judge1,
    'judge2_judge_prompt': judge2Prompt || DEFAULT_JUDGE_PROMPTS.judge2,
    'judge3_judge_prompt': judge3Prompt || DEFAULT_JUDGE_PROMPTS.judge3
  };
  
  chrome.storage.local.set(settingsToStore, function() {
    if (chrome.runtime.lastError) {
      console.error('Error saving settings to chrome.storage.local:', chrome.runtime.lastError);
    } else {
      console.log('Settings also saved to chrome.storage.local for background script access');
    }
  });
  
  showPopupMessage('Settings saved successfully!', 'success');
  console.log('Settings saved:', { 
    apiKey, 
    apiEndpoint, 
    downloadFiles, 
    enableScreenshotAnalysis,
    model: localStorage.getItem('openai_model'),
    aiJudges: { enableJudge1, enableJudge2, enableJudge3 }
  });
}); 