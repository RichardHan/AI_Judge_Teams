// Global variables for access in all functions
let activeTeams = [];
let currentState = { isCapturing: false, activeTeamId: null };
let transcriptChunks = [];

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

// Initialization function that runs after page load
document.addEventListener('DOMContentLoaded', function() {
  console.log('[POPUP_SCRIPT] Page loaded, initializing application');
  
  // Check extension capabilities and display status
  checkExtensionCapabilities();
  
  // Load team data from localStorage immediately
  try {
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    console.log('[POPUP_SCRIPT] Loaded session data from localStorage, session count:', activeTeams.length);
    if (activeTeams.length > 0) {
      activeTeams.forEach((team, idx) => {
        console.log(`[POPUP_SCRIPT] Session ${idx+1}: ${team.name}, transcripts: ${team.transcripts ? team.transcripts.length : 0}`);
      });
    } else {
      console.log('[POPUP_SCRIPT] No recording sessions found, initializing empty array');
      activeTeams = [];
      // Create a default session to get started
      if (confirm('No recording sessions found. Would you like to create your first session?\n\nEnter a topic or purpose for this recording session.')) {
        const sessionPurpose = prompt('What is the purpose of this recording session?', 'Meeting Transcription');
        if (sessionPurpose) {
          const newTeam = {
            id: Date.now().toString(),
            name: sessionPurpose,
            transcripts: []
          };
          activeTeams.push(newTeam);
          localStorage.setItem('teams', JSON.stringify(activeTeams));
          console.log('[POPUP_SCRIPT] Created new recording session:', sessionPurpose);
        }
      }
    }
  } catch (error) {
    console.error('[POPUP_SCRIPT] Error loading session data:', error);
    activeTeams = [];
  }
  
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const teamSelect = document.getElementById('teamSelect');
  const statusDisplay = document.getElementById('status');
  const transcriptContainer = document.getElementById('transcriptContainer');
  
  let transcriptSaved = false; // Prevent duplicate transcript saves
  
  // Load settings
  const captureMode = localStorage.getItem('captureMode') || 'segmented';
  loadSettings();
  
  // Load team selection
  function loadTeamSelect() {
    console.log('[POPUP_SCRIPT] Loading team select dropdown...');
    
    // 從localStorage獲取最新團隊數據
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    console.log('[POPUP_SCRIPT] Teams loaded from localStorage:', activeTeams.length);
    
    // 清空下拉選單
    teamSelect.innerHTML = '';
    
    if (activeTeams.length === 0) {
      // If no sessions exist, show placeholder option
      const option = document.createElement('option');
      option.value = "";
      option.textContent = "Create a recording session first";
      option.disabled = true;
      option.selected = true;
      teamSelect.appendChild(option);
      console.log('[POPUP_SCRIPT] No sessions found, showing placeholder option');
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
    
    // 嘗試恢復保存的團隊選擇
    const savedTeamId = localStorage.getItem('selected_team_id');
    console.log('[POPUP_SCRIPT] Saved team ID from localStorage:', savedTeamId);
    
    // 優先順序：1. currentState.activeTeamId (來自background) 2. savedTeamId (持久化選擇) 3. 第一個團隊
    let teamToSelect = null;
    
    if (currentState.activeTeamId) {
      const teamExists = activeTeams.some(team => team.id === currentState.activeTeamId);
      if (teamExists) {
        teamToSelect = currentState.activeTeamId;
        console.log(`[POPUP_SCRIPT] Using active team from background: ${currentState.activeTeamId}`);
      }
    }
    
    if (!teamToSelect && savedTeamId) {
      const teamExists = activeTeams.some(team => team.id === savedTeamId);
      if (teamExists) {
        teamToSelect = savedTeamId;
        currentState.activeTeamId = savedTeamId;
        console.log(`[POPUP_SCRIPT] Restored saved team selection: ${savedTeamId}`);
      } else {
        console.warn(`[POPUP_SCRIPT] Saved team ID not found in teams list: ${savedTeamId}`);
        // 清除無效的保存選擇
        localStorage.removeItem('selected_team_id');
      }
    }
    
    if (!teamToSelect && activeTeams.length > 0) {
      teamToSelect = activeTeams[0].id;
      currentState.activeTeamId = teamToSelect;
      console.log(`[POPUP_SCRIPT] No saved selection, defaulted to first team: ${teamToSelect}`);
    }
    
    if (teamToSelect) {
      teamSelect.value = teamToSelect;
      console.log(`[POPUP_SCRIPT] Team dropdown set to: ${teamToSelect}`);
    }
    
    // 更新刪除按鈕狀態
    updateDeleteButtonState();
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
          // 保存選中的團隊ID到localStorage以便持久化
          localStorage.setItem('selected_team_id', selectedTeamId);
          console.log('[POPUP_SCRIPT] Team selection saved to localStorage:', selectedTeamId);
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
    console.log('[POPUP_SCRIPT] StartBtn: Clicked. Current currentState:', JSON.stringify(currentState));
    
    const selectedTeamId = teamSelect.value;
    if (!selectedTeamId) {
      alert('Please select a recording session first');
      return;
    }
    
    // First check if we're on a compatible tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        alert('No active tab found. Please make sure you have a tab open.');
        return;
      }
      
      const currentTab = tabs[0];
      console.log('[POPUP_SCRIPT] Current tab info:', {
        url: currentTab.url,
        title: currentTab.title
      });
      
      // Check if the current tab is compatible
      if (currentTab.url.startsWith('chrome://') || 
          currentTab.url.startsWith('chrome-extension://') ||
          currentTab.url.startsWith('file://')) {
        alert('Cannot capture audio from Chrome system pages.\n\nPlease:\n1. Open a regular website (like teams.microsoft.com)\n2. Make sure the page is playing audio or has microphone access\n3. Try starting capture again');
        return;
      }
      
      // Provide user guidance
      if (!currentTab.url.includes('teams.microsoft.com')) {
        const proceed = confirm(`You're currently on: ${currentTab.title}\n\nFor best results:\n• Use Microsoft Teams (teams.microsoft.com)\n• Join a meeting or call\n• Make sure audio is playing\n\nDo you want to continue with the current tab?`);
        if (!proceed) {
          return;
        }
      }
      
      // 檢查API Key
      const apiKey = localStorage.getItem('openai_api_key');
      if (!apiKey || apiKey.trim() === '') {
        const userApiKey = prompt('Please enter your OpenAI API key for transcription:');
        if (!userApiKey || userApiKey.trim() === '') {
          alert('API key is required for transcription');
          return;
        }
        // 儲存API金鑰
        localStorage.setItem('openai_api_key', userApiKey.trim());
      } else {
        // 儲存API金鑰 (確保它已儲存)
        localStorage.setItem('openai_api_key', apiKey);
      }
      
      // Check if STT model is selected
      const sttModel = localStorage.getItem('openai_transcription_model');
      const sttEndpoint = localStorage.getItem('openai_stt_api_endpoint');
      
      // Validate STT configuration
      if (!sttModel || sttModel.trim() === '') {
        const modelSelect = document.getElementById('sttModelSelect');
        const providerSelect = document.getElementById('sttProviderSelect');
        
        if (modelSelect && modelSelect.value && modelSelect.value !== '') {
          // Model is selected in dropdown but not saved yet
          localStorage.setItem('openai_transcription_model', modelSelect.value);
        } else {
          alert('Please select a Speech-to-Text model in the settings.');
          // Open settings panel
          document.getElementById('settingsPanel').classList.remove('hidden');
          return;
        }
      }
      
      // Validate STT API key
      const sttApiKey = localStorage.getItem('openai_stt_api_key');
      if (!sttApiKey && sttEndpoint && sttEndpoint !== 'https://api.openai.com/v1') {
        // Non-OpenAI endpoint needs its own API key
        const providerName = sttEndpoint.includes('groq.com') ? 'Groq' : 
                            sttEndpoint.includes('trendmicro.com') ? 'Trend Micro' : 
                            'your STT provider';
        alert(`Please enter the API key for ${providerName} in the STT API Key field.`);
        document.getElementById('settingsPanel').classList.remove('hidden');
        return;
      }
      
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
      
      showPopupMessage("Starting audio capture...", "success", 2000);
      
      chrome.runtime.sendMessage(
        messagePayload,
        function(response) {
          console.log('[POPUP_SCRIPT] Received response from background script for startCapture:', response);
          if (response && response.success) {
            currentState.isCapturing = true;
            currentState.activeTeamId = selectedTeamId;
            updateUIState();
            console.log('[POPUP_SCRIPT] StartBtn Callback: Capture started. currentState:', JSON.stringify(currentState), 'selectedTeamId was:', selectedTeamId);
            showPopupMessage("Audio capture started successfully!", "success", 3000);
          } else {
            console.error('開始捕獲失敗:', response ? response.error : 'No response or error field missing');
            const errorMsg = response ? response.error : 'Unknown error';
            
            // Provide helpful error messages
            let userMsg = 'Failed to start capture: ' + errorMsg;
            if (errorMsg.includes('tabCapture') || errorMsg.includes('Unknown error')) {
              userMsg += '\n\nTroubleshooting:\n• Make sure you\'re on a regular website (not Chrome pages)\n• Try refreshing the page\n• Make sure the page has audio or microphone access\n• Check that the extension has proper permissions';
            }
            
            alert(userMsg);
          }
        }
      );
    });
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
        // Increase delay to 20 seconds to ensure all saves complete
        setTimeout(function() {
          // First check if there are any pending saves
          checkAndProcessPendingSaves().then(() => {
            transcriptChunks = [];
            transcriptContainer.innerHTML = '';
            transcriptSaved = false; // 重置保存狀態
            chrome.runtime.sendMessage({ action: 'clearTranscripts' }, function(response) {
              if (chrome.runtime.lastError) {
                console.warn('[POPUP_SCRIPT] Error sending clearTranscripts message:', chrome.runtime.lastError.message);
              } else {
                console.log('[POPUP_SCRIPT] clearTranscripts response:', response);
              }
            });
            console.log('[POPUP_SCRIPT] Cleared transcript content display after stopping');
            showPopupMessage("所有轉錄已處理完成並保存到團隊記錄", "success", 3000);
          });
        }, 20000); // 20 seconds to ensure all API calls and saves complete
        
      } else {
        console.error('[POPUP_SCRIPT] 停止捕獲失敗:', response ? response.error : '沒有回應');
        showPopupMessage('停止錄音失敗: ' + (response ? response.error : '未知錯誤'), "error", 5000);
      }
    });
  });
  
  // Add session button click event
  document.getElementById('addTeamBtn').addEventListener('click', function() {
    const sessionPurpose = prompt('Enter the purpose or topic for this recording session:', 'Meeting Notes - ' + new Date().toLocaleDateString());
    if (sessionPurpose) {
      // Get latest session data
      activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
      
      const newTeam = {
        id: Date.now().toString(),
        name: sessionPurpose,
        transcripts: []
      };
      
      console.log('[POPUP_SCRIPT] Creating new recording session:', newTeam);
      
      activeTeams.push(newTeam);
      localStorage.setItem('teams', JSON.stringify(activeTeams));
      
      // Confirm session creation
      console.log('[POPUP_SCRIPT] Session created. Total sessions:', activeTeams.length);
      console.log('[POPUP_SCRIPT] Sessions in localStorage:', JSON.parse(localStorage.getItem('teams')));
      
      loadTeamSelect();
      
      // Auto-select the new session
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
      
      showPopupMessage(`New session created: ${sessionPurpose}`, "success");
    }
  });
  
  // 刪除團隊按鈕點擊事件
  document.getElementById('deleteTeamBtn').addEventListener('click', function() {
    const selectedTeamId = teamSelect.value;
    if (!selectedTeamId) {
      showPopupMessage('Please select a session to delete', 'error');
      return;
    }
    
    // 獲取最新的團隊數據
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    const teamToDelete = activeTeams.find(team => team.id === selectedTeamId);
    
    if (!teamToDelete) {
      showPopupMessage('Session not found', 'error');
      return;
    }
    
    // 確認刪除
    const confirmMessage = `Are you sure you want to delete the session "${teamToDelete.name}"?\n\nThis will permanently delete all ${teamToDelete.transcripts ? teamToDelete.transcripts.length : 0} transcript(s) from this recording session.`;
    
    if (confirm(confirmMessage)) {
      // 過濾掉要刪除的團隊
      activeTeams = activeTeams.filter(team => team.id !== selectedTeamId);
      
      // 保存更新後的團隊列表
      localStorage.setItem('teams', JSON.stringify(activeTeams));
      
      // 清除保存的選擇如果刪除的是當前選中的團隊
      if (localStorage.getItem('selected_team_id') === selectedTeamId) {
        localStorage.removeItem('selected_team_id');
      }
      
      console.log(`[POPUP_SCRIPT] Session deleted: ${teamToDelete.name} (${selectedTeamId})`);
      
      // 重新載入團隊選擇下拉列表
      loadTeamSelect();
      
      showPopupMessage(`Session "${teamToDelete.name}" deleted successfully`, 'success');
      
      // 如果還有其他團隊，選擇第一個
      if (activeTeams.length > 0) {
        const newSelectedTeam = activeTeams[0];
        teamSelect.value = newSelectedTeam.id;
        
        // 通知背景腳本更新活躍團隊
        chrome.runtime.sendMessage(
          { action: 'setActiveTeam', teamId: newSelectedTeam.id },
          function(response) {
            if (response.success) {
              currentState.activeTeamId = newSelectedTeam.id;
              localStorage.setItem('selected_team_id', newSelectedTeam.id);
              console.log('[POPUP_SCRIPT] Active team switched to:', newSelectedTeam.id);
            }
          }
        );
      } else {
        // 沒有團隊了，重置狀態
        currentState.activeTeamId = null;
        chrome.runtime.sendMessage({ action: 'setActiveTeam', teamId: null });
      }
      
      showPopupMessage(`Team "${teamToDelete.name}" has been deleted`, 'success');
      updateDeleteButtonState();
    }
  });
  
  // 更新刪除按鈕狀態
  function updateDeleteButtonState() {
    const deleteBtn = document.getElementById('deleteTeamBtn');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    const selectedTeamId = teamSelect.value;
    
    // 如果沒有選中團隊或正在錄音，禁用刪除按鈕
    deleteBtn.disabled = !selectedTeamId || currentState.isCapturing;
    
    // Update bulk delete button
    const teams = JSON.parse(localStorage.getItem('teams')) || [];
    bulkDeleteBtn.disabled = teams.length === 0 || currentState.isCapturing;
  }
  
  // 在團隊選擇改變時更新刪除按鈕狀態
  teamSelect.addEventListener('change', updateDeleteButtonState);
  
  // Bulk Delete Button Click Event
  const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
  const bulkDeletePanel = document.getElementById('bulkDeletePanel');
  const teamListForDelete = document.getElementById('teamListForDelete');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const cancelBulkDeleteBtn = document.getElementById('cancelBulkDeleteBtn');
  const confirmBulkDeleteBtn = document.getElementById('confirmBulkDeleteBtn');
  
  let selectedTeamsForDelete = new Set();
  
  // Show bulk delete panel
  bulkDeleteBtn.addEventListener('click', function() {
    // Hide other panels first
    document.getElementById('historyPanel').classList.add('hidden');
    document.getElementById('settingsPanel').classList.add('hidden');
    
    // Show bulk delete panel
    bulkDeletePanel.classList.remove('hidden');
    
    // Load teams into checkboxes
    loadTeamsForBulkDelete();
  });
  
  // Load teams for bulk delete
  function loadTeamsForBulkDelete() {
    activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
    teamListForDelete.innerHTML = '';
    selectedTeamsForDelete.clear();
    
    if (activeTeams.length === 0) {
      teamListForDelete.innerHTML = '<p style="text-align: center; color: #666;">No teams available</p>';
      return;
    }
    
    activeTeams.forEach(team => {
      const teamItem = document.createElement('div');
      teamItem.className = 'team-item-checkbox';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `team-cb-${team.id}`;
      checkbox.value = team.id;
      
      const label = document.createElement('label');
      label.htmlFor = `team-cb-${team.id}`;
      label.textContent = `${team.name} (${team.transcripts ? team.transcripts.length : 0} transcripts)`;
      
      teamItem.appendChild(checkbox);
      teamItem.appendChild(label);
      
      // Click handler for the entire item
      teamItem.addEventListener('click', function(e) {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        updateTeamSelection(team.id, checkbox.checked);
      });
      
      checkbox.addEventListener('change', function() {
        updateTeamSelection(team.id, this.checked);
      });
      
      teamListForDelete.appendChild(teamItem);
    });
    
    updateBulkDeleteButtonState();
  }
  
  // Update team selection
  function updateTeamSelection(teamId, isSelected) {
    const teamItem = document.querySelector(`#team-cb-${teamId}`).parentElement;
    
    if (isSelected) {
      selectedTeamsForDelete.add(teamId);
      teamItem.classList.add('selected');
    } else {
      selectedTeamsForDelete.delete(teamId);
      teamItem.classList.remove('selected');
    }
    
    updateBulkDeleteButtonState();
  }
  
  // Update bulk delete button state
  function updateBulkDeleteButtonState() {
    const hasSelection = selectedTeamsForDelete.size > 0;
    confirmBulkDeleteBtn.disabled = !hasSelection;
    
    if (hasSelection) {
      confirmBulkDeleteBtn.textContent = `Delete Selected (${selectedTeamsForDelete.size})`;
    } else {
      confirmBulkDeleteBtn.textContent = 'Delete Selected';
    }
    
    // Update bulk delete button in team section
    bulkDeleteBtn.disabled = activeTeams.length === 0 || currentState.isCapturing;
  }
  
  // Select All button
  selectAllBtn.addEventListener('click', function() {
    const checkboxes = teamListForDelete.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = true;
      updateTeamSelection(cb.value, true);
    });
  });
  
  // Deselect All button
  deselectAllBtn.addEventListener('click', function() {
    const checkboxes = teamListForDelete.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = false;
      updateTeamSelection(cb.value, false);
    });
  });
  
  // Cancel bulk delete
  cancelBulkDeleteBtn.addEventListener('click', function() {
    bulkDeletePanel.classList.add('hidden');
    selectedTeamsForDelete.clear();
  });
  
  // Confirm bulk delete
  confirmBulkDeleteBtn.addEventListener('click', function() {
    if (selectedTeamsForDelete.size === 0) return;
    
    const teamsToDelete = activeTeams.filter(team => selectedTeamsForDelete.has(team.id));
    const totalTranscripts = teamsToDelete.reduce((sum, team) => sum + (team.transcripts ? team.transcripts.length : 0), 0);
    
    const confirmMessage = `Are you sure you want to delete ${teamsToDelete.length} team(s)?\n\n` +
      `Teams to delete:\n${teamsToDelete.map(t => `- ${t.name}`).join('\n')}\n\n` +
      `This will permanently delete ${totalTranscripts} transcript(s).`;
    
    if (confirm(confirmMessage)) {
      // Filter out teams to delete
      activeTeams = activeTeams.filter(team => !selectedTeamsForDelete.has(team.id));
      
      // Save updated teams
      localStorage.setItem('teams', JSON.stringify(activeTeams));
      
      // Clean up saved selection if needed
      const savedTeamId = localStorage.getItem('selected_team_id');
      if (savedTeamId && selectedTeamsForDelete.has(savedTeamId)) {
        localStorage.removeItem('selected_team_id');
      }
      
      console.log(`[POPUP_SCRIPT] Bulk deleted ${teamsToDelete.length} teams`);
      
      // Hide panel
      bulkDeletePanel.classList.add('hidden');
      selectedTeamsForDelete.clear();
      
      // Reload team select
      loadTeamSelect();
      
      // Update active team if needed
      if (currentState.activeTeamId && selectedTeamsForDelete.has(currentState.activeTeamId)) {
        if (activeTeams.length > 0) {
          const newSelectedTeam = activeTeams[0];
          teamSelect.value = newSelectedTeam.id;
          chrome.runtime.sendMessage(
            { action: 'setActiveTeam', teamId: newSelectedTeam.id },
            function(response) {
              if (response.success) {
                currentState.activeTeamId = newSelectedTeam.id;
                localStorage.setItem('selected_team_id', newSelectedTeam.id);
              }
            }
          );
        } else {
          currentState.activeTeamId = null;
          chrome.runtime.sendMessage({ action: 'setActiveTeam', teamId: null });
        }
      }
      
      showPopupMessage(`Successfully deleted ${teamsToDelete.length} team(s)`, 'success');
      updateDeleteButtonState();
      updateBulkDeleteButtonState();
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
    
    // 更新刪除按鈕狀態
    updateDeleteButtonState();
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
        // Also show the specific error message
        if (message.error.includes('permission')) {
          alert(`Permission Error: ${message.error}\n\nPlease:\n1. Go to chrome://extensions/\n2. Find this extension\n3. Make sure all permissions are enabled\n4. Try again`);
        } else if (message.error.includes('no audio')) {
          alert(`Audio Error: ${message.error}\n\nTips:\n• Try a website with audio (like YouTube)\n• Make sure the tab is not muted\n• Join a Teams meeting or call\n• Play some audio on the page first`);
        } else {
          alert(`Audio Capture Error: ${message.error}`);
        }
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
        // Handle async function properly
        saveTranscriptToTeamFromBackground(message.teamId, message.transcriptChunks, message.fullText)
          .then(saveResult => {
            if (saveResult) {
              console.log('[POPUP_SCRIPT] Transcript saved successfully from background request');
              showPopupMessage("轉錄已保存到團隊記錄", "success", 3000);
              
              // 自動複製轉錄內容到剪貼板（確保團隊資訊已保存）
              console.log('[POPUP_SCRIPT] Auto-copying transcript to clipboard after successful save');
              autoCopyTranscriptToClipboard();
              
              sendResponse({ success: true, message: 'Transcript saved successfully' });
            } else {
              console.error('[POPUP_SCRIPT] Failed to save transcript from background request');
              showPopupMessage("保存轉錄失敗", "error", 3000);
              sendResponse({ success: false, error: 'Failed to save transcript' });
            }
          })
          .catch(error => {
            console.error('[POPUP_SCRIPT] Error saving transcript from background:', error);
            showPopupMessage("保存轉錄失敗", "error", 3000);
            sendResponse({ success: false, error: error.message });
          });
        return true; // Will respond asynchronously
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
        
      case 'captureStarted':
        // Handle successful capture start
        console.log('[POPUP_SCRIPT] Capture started successfully:', message.message);
        showPopupMessage("🎙️ Audio capture started successfully!", "success", 3000);
        break;
        
      case 'progressiveSaveTranscript':
        // Handle progressive save request from background
        console.log('[POPUP_SCRIPT] Received progressive save request from background');
        const progressiveResult = saveProgressiveTranscript(message.teamId, message.transcriptChunks, message.fullText);
        sendResponse({ success: progressiveResult });
        break;
        
      case 'checkPendingSaves':
        // Background notified us to check for pending saves
        console.log('[POPUP_SCRIPT] Background notified about pending saves');
        checkAndProcessPendingSaves();
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
  async function saveTranscriptToTeam(teamIdToSave) {
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
      
      // Remove any progressive transcript when saving final
      latestTeams[teamIndex].transcripts = latestTeams[teamIndex].transcripts.filter(
        t => !t.isProgressive
      );
      
      // 準備轉錄數據的深拷貝
      const transcriptChunksCopy = JSON.parse(JSON.stringify(transcriptChunks));
      
      // 添加新的轉錄記錄
      const newTranscript = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        text: fullText,
        chunks: transcriptChunksCopy,
        isProgressive: false
      };
      
      latestTeams[teamIndex].transcripts.push(newTranscript);
      
      // 保存更新後的團隊數據 with retry logic
      let saveAttempts = 0;
      const maxAttempts = 3;
      let saved = false;
      
      while (saveAttempts < maxAttempts && !saved) {
        try {
          localStorage.setItem('teams', JSON.stringify(latestTeams));
          console.log('[POPUP_SCRIPT] 轉錄保存成功! 團隊:', latestTeams[teamIndex].name);
          console.log('[POPUP_SCRIPT] 該團隊現有轉錄數:', latestTeams[teamIndex].transcripts.length);
          
          // 更新本地activeTeams變量以保持一致
          activeTeams = latestTeams;
          saved = true;
          
          // 顯示成功訊息 with details
          showPopupMessage(`轉錄已成功保存到團隊記錄 (${latestTeams[teamIndex].name})`, "success", 3000);
          return true;
        } catch (error) {
          saveAttempts++;
          console.error(`[POPUP_SCRIPT] 保存到localStorage失敗 (attempt ${saveAttempts}/${maxAttempts}):`, error);
          if (saveAttempts < maxAttempts) {
            // Wait a bit before retrying
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            alert(`保存轉錄記錄失敗 (嘗試了${maxAttempts}次): ${error.message}\n\n請確認瀏覽器儲存空間足夠。`);
            // As a last resort, try to save to chrome.storage
            try {
              await chrome.storage.local.set({
                'emergency_save': {
                  teamId: teamIdToSave,
                  transcript: newTranscript,
                  timestamp: Date.now()
                }
              });
              showPopupMessage('緊急保存到Chrome儲存區', 'error', 5000);
            } catch (e) {
              console.error('[POPUP_SCRIPT] Emergency save also failed:', e);
            }
            return false;
          }
        }
      }
    } catch (error) {
      console.error('[POPUP_SCRIPT] saveTranscriptToTeam錯誤:', error);
      alert('保存轉錄過程中發生錯誤: ' + error.message);
      return false;
    }
  }
  
  // 從background保存轉錄到團隊記錄
  async function saveTranscriptToTeamFromBackground(teamId, transcriptChunks, fullText) {
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
      
      // Remove any progressive transcript when saving final
      latestTeams[teamIndex].transcripts = latestTeams[teamIndex].transcripts.filter(
        t => !t.isProgressive
      );
      
      // 準備轉錄數據的深拷貝
      const transcriptChunksCopy = JSON.parse(JSON.stringify(transcriptChunks));
      
      // 添加新的轉錄記錄
      const newTranscript = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        text: fullText,
        chunks: transcriptChunksCopy,
        isProgressive: false
      };
      
      latestTeams[teamIndex].transcripts.push(newTranscript);
      
      // 保存更新後的團隊數據 with retry logic
      let saveAttempts = 0;
      const maxAttempts = 3;
      let saved = false;
      
      while (saveAttempts < maxAttempts && !saved) {
        try {
          localStorage.setItem('teams', JSON.stringify(latestTeams));
          console.log('[POPUP_SCRIPT] Transcript saved successfully! Team:', latestTeams[teamIndex].name);
          console.log('[POPUP_SCRIPT] Team now has transcripts count:', latestTeams[teamIndex].transcripts.length);
          
          // 更新本地activeTeams變量以保持一致
          activeTeams = latestTeams;
          saved = true;
          return true;
        } catch (error) {
          saveAttempts++;
          console.error(`[POPUP_SCRIPT] Failed to save to localStorage (attempt ${saveAttempts}/${maxAttempts}):`, error);
          if (saveAttempts >= maxAttempts) {
            // As a last resort, save to chrome.storage
            try {
              await chrome.storage.local.set({
                'emergency_save_from_background': {
                  teamId: teamId,
                  transcript: newTranscript,
                  timestamp: Date.now()
                }
              });
              console.log('[POPUP_SCRIPT] Emergency save to chrome.storage successful');
            } catch (e) {
              console.error('[POPUP_SCRIPT] Emergency save also failed:', e);
            }
            return false;
          }
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } catch (error) {
      console.error('[POPUP_SCRIPT] saveTranscriptToTeamFromBackground error:', error);
      return false;
    }
  }
  
  // 設置按鈕事件
  document.getElementById('settingsBtn').addEventListener('click', function() {
    document.getElementById('settingsPanel').classList.toggle('hidden');
    // Hide other panels
    document.getElementById('endpointSettingsPanel').classList.add('hidden');
    document.getElementById('historyPanel').classList.add('hidden');
    document.getElementById('bulkDeletePanel').classList.add('hidden');
  });
  
  // Endpoint settings button event
  document.getElementById('endpointSettingsBtn').addEventListener('click', function() {
    document.getElementById('endpointSettingsPanel').classList.toggle('hidden');
    // Hide other panels
    document.getElementById('settingsPanel').classList.add('hidden');
    document.getElementById('historyPanel').classList.add('hidden');
    document.getElementById('bulkDeletePanel').classList.add('hidden');
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
  
  // Check for pending saves from background on startup
  checkAndProcessPendingSaves();
  
  // Initialize STT provider selection
  initializeSTTProviderSelection();
  
  // Add event listeners for auto-save on API Key and Endpoint inputs
  document.getElementById('apiKeyInput').addEventListener('input', autoSaveApiSettings);
  document.getElementById('apiEndpointInput').addEventListener('input', autoSaveApiSettings);
  document.getElementById('sttApiEndpointInput').addEventListener('input', autoSaveApiSettings);
  document.getElementById('sttApiKeyInput').addEventListener('input', autoSaveApiSettings);
  document.getElementById('sttModelInput').addEventListener('input', autoSaveApiSettings);
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

// STT Provider configurations
const STT_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    models: [
      { value: 'whisper-1', name: 'whisper-1', description: 'Standard model (legacy)' },
      { value: 'gpt-4o-mini-transcribe', name: 'gpt-4o-mini-transcribe', description: 'Faster, cheaper' },
      { value: 'gpt-4o-transcribe', name: 'gpt-4o-transcribe', description: 'Most accurate' }
    ]
  },
  trendmicro: {
    name: 'Trend Micro',
    endpoint: 'https://api.rdsec.trendmicro.com/prod/aiendpoint/v1',
    models: [
      { value: 'whisper-1', name: 'whisper-1', description: 'Balanced performance' }
    ]
  },
  groq: {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    models: [
      { value: 'whisper-large-v3-turbo', name: 'whisper-large-v3-turbo', description: 'Fastest, cheapest, average accuracy' }
    ]
  },
  custom: {
    name: 'Custom',
    endpoint: '',
    models: []
  }
};

// Default User Prompt Template for Meeting Notes
const DEFAULT_USER_PROMPT_TEMPLATE = `You are an expert meeting assistant. Please analyze the meeting content below and provide a comprehensive summary.

**Instructions:**
1. **Key Points**: Extract and summarize the main topics discussed
2. **Action Items**: List specific tasks mentioned with responsible persons (if identified)
3. **Decisions Made**: Highlight any decisions or agreements reached
4. **Next Steps**: Identify follow-up actions and deadlines
5. **Important Details**: Note any significant technical details, numbers, or references

**Meeting Content:**
{context}

**Please format your response as:**
## Meeting Summary

### Key Discussion Points
- [Point 1]
- [Point 2]
- ...

### Action Items
- [ ] [Task] - [Person/Team] - [Deadline if mentioned]
- [ ] [Task] - [Person/Team] - [Deadline if mentioned]

### Decisions Made
- [Decision 1]
- [Decision 2]

### Next Steps
- [Next step 1]
- [Next step 2]

### Additional Notes
[Any other important information]`;

// Function to load saved settings
async function loadSettings() {
  // Use secure storage for API keys
  const savedApiKey = await secureGetItem('openai_api_key') || '';
  const savedApiEndpoint = localStorage.getItem('openai_api_endpoint') || 'https://api.openai.com/v1';
  const savedSttApiEndpoint = localStorage.getItem('openai_stt_api_endpoint') || '';
  const savedSttApiKey = await secureGetItem('openai_stt_api_key') || '';
  const savedSttModel = localStorage.getItem('openai_transcription_model') || '';
  const downloadFiles = localStorage.getItem('download_audio_files') === 'true';
  const savedLanguage = localStorage.getItem('transcription_language') || '';
  const savedScreenshotDetail = localStorage.getItem('screenshot_detail_level') || 'medium';
  const enableScreenshotAnalysis = localStorage.getItem('enable_screenshot_analysis') !== 'false'; // Default to true
  const enableAudioRerouting = localStorage.getItem('enable_audio_rerouting') !== 'false'; // Default to true
  const screenshotInterval = parseInt(localStorage.getItem('screenshot_interval')) || 20;
  const transcriptionInterval = parseInt(localStorage.getItem('transcription_interval')) || 10;
  
  // User Prompt Template is now handled by the template system
  
  // Load model enable states (default: only model 1 enabled)
  const enableModel1 = localStorage.getItem('enable_model1') !== 'false'; // Default to true
  const enableModel2 = localStorage.getItem('enable_model2') === 'true'; // Default to false
  const enableModel3 = localStorage.getItem('enable_model3') === 'true'; // Default to false
  const enableModel4 = localStorage.getItem('enable_model4') === 'true'; // Default to false

  document.getElementById('apiKeyInput').value = savedApiKey;
  document.getElementById('apiEndpointInput').value = savedApiEndpoint;
  document.getElementById('downloadFilesCheckbox').checked = downloadFiles;
  
  // Load STT provider selection
  loadSTTProviderSettings(savedSttApiEndpoint, savedSttModel);
  document.getElementById('languageSelect').value = savedLanguage;
  document.getElementById('screenshotDetailSelect').value = savedScreenshotDetail;
  document.getElementById('enableScreenshotAnalysis').checked = enableScreenshotAnalysis;
  document.getElementById('enableAudioRerouting').checked = enableAudioRerouting;
  document.getElementById('screenshotIntervalInput').value = screenshotInterval;
  document.getElementById('transcriptionIntervalInput').value = transcriptionInterval;
  
  // Set model enable checkboxes
  document.getElementById('enableModel1').checked = enableModel1;
  document.getElementById('enableModel2').checked = enableModel2;
  document.getElementById('enableModel3').checked = enableModel3;
  document.getElementById('enableModel4').checked = enableModel4;
  
  // User Prompt Template is set by the template system
  
  // If there's a saved API key, try to load models
  if (savedApiKey && savedApiEndpoint) {
    testAPIConnection(false); // false to not show success message on initial load
    
    // Sync decrypted API keys to chrome.storage.local for background script
    chrome.storage.local.set({
      'openai_api_key': savedApiKey,
      'openai_stt_api_key': savedSttApiKey || savedApiKey // Use main key as fallback
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error syncing decrypted API keys to chrome.storage:', chrome.runtime.lastError);
      } else {
        console.log('Decrypted API keys synced to chrome.storage for background script');
      }
    });
  }
  
  // Also update STT API key input if available
  const sttApiKeyInput = document.getElementById('sttApiKeyInput');
  if (sttApiKeyInput) {
    sttApiKeyInput.value = savedSttApiKey;
  }
}

// Function to test API connection and fetch models
async function testAPIConnection(showMessage = true) {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiEndpointInput = document.getElementById('apiEndpointInput');
  const modelSelects = [
    document.getElementById('modelSelect1'),
    document.getElementById('modelSelect2'),
    document.getElementById('modelSelect3'),
    document.getElementById('modelSelect4')
  ];
  const screenshotModelSelect = document.getElementById('screenshotModelSelect');
  
  const apiKey = apiKeyInput.value.trim();
  let apiEndpoint = apiEndpointInput.value.trim() || 'https://api.openai.com/v1'; // Default if empty
  
  // Normalize API endpoint - ensure it ends with /v1 and not /v1/
  if (apiEndpoint) {
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    if (!apiEndpoint.endsWith('/v1') && !/\/v\d+$/.test(apiEndpoint)) {
      apiEndpoint = apiEndpoint + '/v1';
    }
  }
  
  if (!apiKey) {
    if (showMessage) showPopupMessage('Please enter your OpenAI API Key.', 'error');
    apiKeyInput.focus();
    return false;
  }
  
  modelSelects.forEach(select => {
    select.innerHTML = '<option value="">Testing connection...</option>';
    select.disabled = true;
  });
  screenshotModelSelect.innerHTML = '<option value="">Testing connection...</option>';
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
    
    modelSelects.forEach(select => {
      select.innerHTML = ''; // Clear previous options
    });
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
        modelSelects.forEach(select => {
          select.innerHTML = '<option value="">No compatible models found.</option>';
        });
        screenshotModelSelect.innerHTML = '<option value="">No compatible models found.</option>';
        if (showMessage) showPopupMessage('Connection successful, but no compatible models found.', 'error');
      } else {
        // Populate all model selectors
        modelSelects.forEach(select => {
          filteredModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            select.appendChild(option);
          });
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
        
        // Try to select previously saved models or set defaults
        const savedModels = [
          localStorage.getItem('openai_model1') || 'gpt-4o-mini',
          localStorage.getItem('openai_model2') || '',
          localStorage.getItem('openai_model3') || '',
          localStorage.getItem('openai_model4') || ''
        ];
        const savedScreenshotModel = localStorage.getItem('openai_screenshot_model');
        
        modelSelects.forEach((select, index) => {
          const savedModel = savedModels[index];
          if (savedModel && select.querySelector(`option[value="${savedModel}"]`)) {
            select.value = savedModel;
          } else if (index === 0 && select.querySelector(`option[value="gpt-4o-mini"]`)) {
            // Default first model to gpt-4o-mini if available
            select.value = 'gpt-4o-mini';
          }
        });
        
        if (savedScreenshotModel && screenshotModelSelect.querySelector(`option[value="${savedScreenshotModel}"]`)) {
            screenshotModelSelect.value = savedScreenshotModel;
        } else if (visionModels.length > 0) {
            // Default to first vision model for screenshots
            screenshotModelSelect.value = visionModels[0].id;
        }
        
        if (showMessage) showPopupMessage('Connection successful! Models loaded.', 'success');
      }
    } else {
      modelSelects.forEach(select => {
        select.innerHTML = '<option value="">No models found.</option>';
      });
      screenshotModelSelect.innerHTML = '<option value="">No models found.</option>';
      if (showMessage) showPopupMessage('Connection successful, but no models returned.', 'error');
    }
    return true;
  } catch (error) {
    console.error('API Connection Test Error:', error);
    modelSelects.forEach(select => {
      select.innerHTML = '<option value="">Connection failed. Check console.</option>';
    });
    if (showMessage) showPopupMessage(`Connection failed: ${error.message}`, 'error', 5000);
    return false;
  } finally {
    modelSelects.forEach(select => {
      select.disabled = false;
    });
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
  let apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  
  // Normalize API endpoint - ensure it ends with /v1 and not /v1/
  if (apiEndpoint) {
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    if (!apiEndpoint.endsWith('/v1') && !/\/v\d+$/.test(apiEndpoint)) {
      apiEndpoint = apiEndpoint + '/v1';
    }
  }
  
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

// Auto-save function for API Key and Endpoint
function autoSaveApiSettings() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  let apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  let sttApiEndpoint = document.getElementById('sttApiEndpointInput').value.trim();
  const sttApiKey = document.getElementById('sttApiKeyInput').value.trim();
  const sttModel = document.getElementById('sttModelInput').value.trim();
  
  // Normalize API endpoint - ensure it ends with /v1 and not /v1/
  if (apiEndpoint) {
    // Remove trailing slashes
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    
    // Ensure it ends with /v1
    if (!apiEndpoint.endsWith('/v1')) {
      // If it ends with /v2, /v3, etc., leave it as is
      if (!/\/v\d+$/.test(apiEndpoint)) {
        // If it doesn't end with /vX pattern, add /v1
        apiEndpoint = apiEndpoint + '/v1';
      }
    }
    
    // Update the input field with the normalized value
    document.getElementById('apiEndpointInput').value = apiEndpoint;
  }
  
  // STT API endpoint - just remove trailing slashes, no /v1 enforcement
  if (sttApiEndpoint) {
    sttApiEndpoint = sttApiEndpoint.replace(/\/+$/, '');
  }
  
  // Save to localStorage
  localStorage.setItem('openai_api_key', apiKey);
  localStorage.setItem('openai_api_endpoint', apiEndpoint);
  localStorage.setItem('openai_stt_api_endpoint', sttApiEndpoint);
  localStorage.setItem('openai_stt_api_key', sttApiKey);
  localStorage.setItem('openai_transcription_model', sttModel);
  
  // Also save to chrome.storage.local for background script access
  chrome.storage.local.set({
    'openai_api_key': apiKey,
    'openai_api_endpoint': apiEndpoint,
    'openai_stt_api_endpoint': sttApiEndpoint,
    'openai_stt_api_key': sttApiKey,
    'openai_transcription_model': sttModel
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('Error auto-saving API settings to chrome.storage.local:', chrome.runtime.lastError);
    } else {
      console.log('API settings auto-saved');
    }
  });
  
  // If both fields have values, try to load models
  if (apiKey && apiEndpoint) {
    testAPIConnection(false); // false to not show success message
  }
}

// Event listener for Save Endpoint Settings button
document.getElementById('saveEndpointSettingsBtn').addEventListener('click', async function() {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  let apiEndpoint = document.getElementById('apiEndpointInput').value.trim() || 'https://api.openai.com/v1';
  let sttApiEndpoint = document.getElementById('sttApiEndpointInput').value.trim();
  const sttApiKey = document.getElementById('sttApiKeyInput').value.trim();
  const sttProvider = document.getElementById('sttProviderSelect').value;
  const sttModel = document.getElementById('sttModelInput').value.trim();
  
  // Validate API keys
  if (!validateApiKey(apiKey)) {
    showPopupMessage('Invalid API key format. Please check your API key.', 'error');
    document.getElementById('apiKeyInput').focus();
    return;
  }
  
  if (sttApiKey && !validateApiKey(sttApiKey)) {
    showPopupMessage('Invalid STT API key format. Please check your API key.', 'error');
    document.getElementById('sttApiKeyInput').focus();
    return;
  }
  
  // Validate endpoint URLs
  if (apiEndpoint && !validateUrl(apiEndpoint)) {
    showPopupMessage('Invalid API endpoint URL. Please use HTTPS URLs only.', 'error');
    document.getElementById('apiEndpointInput').focus();
    return;
  }
  
  if (sttApiEndpoint && !validateUrl(sttApiEndpoint)) {
    showPopupMessage('Invalid STT API endpoint URL. Please use HTTPS URLs only.', 'error');
    document.getElementById('sttApiEndpointInput').focus();
    return;
  }
  
  // Normalize API endpoint
  if (apiEndpoint) {
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    if (!apiEndpoint.endsWith('/v1') && !/\/v\d+$/.test(apiEndpoint)) {
      apiEndpoint = apiEndpoint + '/v1';
    }
  }
  
  // STT API endpoint - just remove trailing slashes
  if (sttApiEndpoint) {
    sttApiEndpoint = sttApiEndpoint.replace(/\/+$/, '');
  }
  
  // Save all endpoint and key settings
  try {
    await secureSetItem('openai_api_key', apiKey);
    await secureSetItem('openai_api_endpoint', apiEndpoint);
    await secureSetItem('openai_stt_api_endpoint', sttApiEndpoint);
    await secureSetItem('openai_stt_api_key', sttApiKey);
    localStorage.setItem('stt_provider', sttProvider);
    localStorage.setItem('openai_transcription_model', sttModel);
    
    showPopupMessage('API configuration saved successfully!', 'success');
  } catch (error) {
    console.error('Failed to save API configuration:', error);
    showPopupMessage('Failed to save API configuration', 'error');
  }
});

// Event listener for Save Settings button
document.getElementById('saveSettingsBtn').addEventListener('click', async function() {
  // Get API configuration values
  const apiKey = await secureGetItem('openai_api_key') || '';
  const apiEndpoint = localStorage.getItem('openai_api_endpoint') || 'https://api.openai.com/v1';
  const sttApiEndpoint = localStorage.getItem('openai_stt_api_endpoint') || '';
  const sttApiKey = await secureGetItem('openai_stt_api_key') || '';
  const sttModel = localStorage.getItem('openai_transcription_model') || '';
  
  const selectedModel1 = document.getElementById('modelSelect1').value;
  const selectedModel2 = document.getElementById('modelSelect2').value;
  const selectedModel3 = document.getElementById('modelSelect3').value;
  const selectedModel4 = document.getElementById('modelSelect4').value;
  const enableModel1 = document.getElementById('enableModel1').checked;
  const enableModel2 = document.getElementById('enableModel2').checked;
  const enableModel3 = document.getElementById('enableModel3').checked;
  const enableModel4 = document.getElementById('enableModel4').checked;
  const selectedScreenshotModel = document.getElementById('screenshotModelSelect').value;
  const screenshotDetailLevel = document.getElementById('screenshotDetailSelect').value;
  const downloadFiles = document.getElementById('downloadFilesCheckbox').checked;
  const enableScreenshotAnalysis = document.getElementById('enableScreenshotAnalysis').checked;
  const enableAudioRerouting = document.getElementById('enableAudioRerouting').checked;
  const screenshotInterval = parseInt(document.getElementById('screenshotIntervalInput').value) || 20;
  const transcriptionInterval = parseInt(document.getElementById('transcriptionIntervalInput').value) || 10;
  
  // User prompt template is now handled by the template system

  if (!apiKey) {
    showPopupMessage('API Key cannot be empty. Please configure in API Configuration settings.', 'error');
    return;
  }

  // Test connection before saving if models aren't loaded
  const modelSelect1 = document.getElementById('modelSelect1');
  if (!modelSelect1.value || modelSelect1.options.length <= 1 && modelSelect1.options[0].value === "") {
      showPopupMessage('Testing connection before saving...', 'success');
      const connectionSuccessful = await testAPIConnection(true);
      if (!connectionSuccessful) {
          showPopupMessage('Cannot save settings. API connection failed.', 'error');
          return;
      }
  }
  
  // Validate that at least one model is enabled and selected
  const enabledModels = [
    enableModel1 && selectedModel1,
    enableModel2 && selectedModel2,
    enableModel3 && selectedModel3,
    enableModel4 && selectedModel4
  ].filter(Boolean);
  
  if (enabledModels.length === 0) {
    showPopupMessage('Please enable and select at least one model.', 'error');
    return;
  }
  
  // Validate intervals
  if (screenshotInterval < 5 || screenshotInterval > 300) {
    showPopupMessage('Screenshot interval must be between 5 and 300 seconds.', 'error');
    document.getElementById('screenshotIntervalInput').focus();
    return;
  }
  
  if (transcriptionInterval < 5 || transcriptionInterval > 60) {
    showPopupMessage('Transcription interval must be between 5 and 60 seconds.', 'error');
    document.getElementById('transcriptionIntervalInput').focus();
    return;
  }

  // Save model selections
  localStorage.setItem('openai_model1', selectedModel1);
  localStorage.setItem('openai_model2', selectedModel2);
  localStorage.setItem('openai_model3', selectedModel3);
  localStorage.setItem('openai_model4', selectedModel4);
  localStorage.setItem('enable_model1', enableModel1.toString());
  localStorage.setItem('enable_model2', enableModel2.toString());
  localStorage.setItem('enable_model3', enableModel3.toString());
  localStorage.setItem('enable_model4', enableModel4.toString());
  localStorage.setItem('openai_screenshot_model', selectedScreenshotModel);
  localStorage.setItem('screenshot_detail_level', screenshotDetailLevel);
  localStorage.setItem('enable_screenshot_analysis', enableScreenshotAnalysis.toString());
  localStorage.setItem('enable_audio_rerouting', enableAudioRerouting.toString());
  localStorage.setItem('download_audio_files', downloadFiles.toString());
  localStorage.setItem('transcription_language', document.getElementById('languageSelect').value);
  localStorage.setItem('screenshot_interval', screenshotInterval.toString());
  localStorage.setItem('transcription_interval', transcriptionInterval.toString());
  
  // Save User Prompt Template setting
  // User prompt template is saved by the template system
  
  // For backward compatibility, save the first enabled model as the primary model
  if (enableModel1 && selectedModel1) {
    localStorage.setItem('openai_model', selectedModel1);
  } else if (enableModel2 && selectedModel2) {
    localStorage.setItem('openai_model', selectedModel2);
  } else if (enableModel3 && selectedModel3) {
    localStorage.setItem('openai_model', selectedModel3);
  } else if (enableModel4 && selectedModel4) {
    localStorage.setItem('openai_model', selectedModel4);
  }
  
  // Also save to chrome.storage.local for background script access
  const settingsToStore = {
    'openai_api_key': apiKey,
    'openai_api_endpoint': apiEndpoint,
    'openai_stt_api_endpoint': sttApiEndpoint,
    'openai_stt_api_key': sttApiKey,
    'openai_transcription_model': sttModel,
    'openai_model': localStorage.getItem('openai_model'),
    'openai_model1': selectedModel1,
    'openai_model2': selectedModel2,
    'openai_model3': selectedModel3,
    'openai_model4': selectedModel4,
    'enable_model1': enableModel1.toString(),
    'enable_model2': enableModel2.toString(),
    'enable_model3': enableModel3.toString(),
    'enable_model4': enableModel4.toString(),
    'openai_screenshot_model': selectedScreenshotModel,
    'screenshot_detail_level': screenshotDetailLevel,
    'enable_screenshot_analysis': enableScreenshotAnalysis.toString(),
    'enable_audio_rerouting': enableAudioRerouting.toString(),
    'download_audio_files': downloadFiles.toString(),
    'transcription_language': document.getElementById('languageSelect').value,
    'user_prompt_template': userPromptTemplate || DEFAULT_USER_PROMPT_TEMPLATE,
    'screenshot_interval': screenshotInterval.toString(),
    'transcription_interval': transcriptionInterval.toString()
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
    models: [
      { model: selectedModel1, enabled: enableModel1 },
      { model: selectedModel2, enabled: enableModel2 },
      { model: selectedModel3, enabled: enableModel3 },
      { model: selectedModel4, enabled: enableModel4 }
    ],
    userPromptTemplate: userPromptTemplate.length > 50 ? userPromptTemplate.substring(0, 50) + '...' : userPromptTemplate
  });
});

// Show copy to clipboard button after recording stops
function showCopyToClipboardButton() {
  console.log('[POPUP_SCRIPT] showCopyToClipboardButton called');
  
  // Check if button already exists
  let copyBtn = document.getElementById('copyTranscriptBtn');
  if (copyBtn) {
    copyBtn.style.display = 'block';
    return;
  }
  
  // Create the button
  copyBtn = document.createElement('button');
  copyBtn.id = 'copyTranscriptBtn';
  copyBtn.className = 'copy-transcript-btn';
  copyBtn.innerHTML = '📋 Copy Transcript to Clipboard';
  copyBtn.style.cssText = `
    width: 100%;
    padding: 12px;
    margin: 10px 0;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: bold;
    transition: background-color 0.3s;
  `;
  
  // Add hover effect
  copyBtn.onmouseover = function() {
    this.style.backgroundColor = '#45a049';
  };
  copyBtn.onmouseout = function() {
    this.style.backgroundColor = '#4CAF50';
  };
  
  // Add click handler
  copyBtn.addEventListener('click', async function() {
    console.log('[POPUP_SCRIPT] Copy transcript button clicked');
    
    // Disable button and show processing state
    this.disabled = true;
    this.innerHTML = '📋 Processing...';
    
    try {
      // Build transcript content
      let content = '';
      const team = activeTeams.find(t => t.id === currentState.activeTeamId);
      const teamName = team ? team.name : 'Unknown Team';
      const date = new Date();
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      
      content += `${teamName} - ${formattedDate}\n\n`;
      
      // Add transcript chunks
      if (transcriptChunks.length > 0) {
        transcriptChunks.forEach(chunk => {
          const chunkDate = new Date(chunk.timestamp);
          const formattedTime = `${chunkDate.getHours().toString().padStart(2, '0')}:${chunkDate.getMinutes().toString().padStart(2, '0')}:${chunkDate.getSeconds().toString().padStart(2, '0')}`;
          
          if (chunk.type === 'screenshot' || chunk.type === 'screenshot_analysis') {
            content += `[${formattedTime}] [Screenshot Analysis] ${chunk.analysis}\n\n`;
          } else {
            content += `[${formattedTime}] ${chunk.text || chunk.analysis || ''}\n\n`;
          }
        });
      }
      
      // Get user prompt template if available
      const userPromptTemplate = localStorage.getItem('user_prompt_template');
      let finalContent = '';
      
      if (userPromptTemplate && userPromptTemplate.trim()) {
        // Replace {context} with transcript content
        finalContent = userPromptTemplate.replace(/{context}/g, content);
      } else {
        // Just use transcript content
        finalContent = content;
      }
      
      // Copy to clipboard
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(finalContent);
        
        // Show success state
        this.innerHTML = '✅ Copied to Clipboard!';
        this.style.backgroundColor = '#28a745';
        showPopupMessage('Transcript copied to clipboard successfully!', 'success', 2000);
        
        // Reset button after 2 seconds
        setTimeout(() => {
          this.innerHTML = '📋 Copy Transcript to Clipboard';
          this.style.backgroundColor = '#4CAF50';
          this.disabled = false;
        }, 2000);
        
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = finalContent;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            this.innerHTML = '✅ Copied to Clipboard!';
            this.style.backgroundColor = '#28a745';
            showPopupMessage('Transcript copied to clipboard successfully!', 'success', 2000);
            
            setTimeout(() => {
              this.innerHTML = '📋 Copy Transcript to Clipboard';
              this.style.backgroundColor = '#4CAF50';
              this.disabled = false;
            }, 2000);
          } else {
            throw new Error('Copy command failed');
          }
        } catch (err) {
          throw err;
        } finally {
          document.body.removeChild(textArea);
        }
      }
      
    } catch (error) {
      console.error('[POPUP_SCRIPT] Copy to clipboard failed:', error);
      this.innerHTML = '❌ Copy Failed';
      this.style.backgroundColor = '#dc3545';
      showPopupMessage('Failed to copy to clipboard: ' + error.message, 'error', 3000);
      
      setTimeout(() => {
        this.innerHTML = '📋 Copy Transcript to Clipboard';
        this.style.backgroundColor = '#4CAF50';
        this.disabled = false;
      }, 2000);
    }
  });
  
  // Insert button after transcript container
  const transcriptContainer = document.getElementById('transcriptContainer');
  if (transcriptContainer && transcriptContainer.parentNode) {
    transcriptContainer.parentNode.insertBefore(copyBtn, transcriptContainer.nextSibling);
  }
}

// Hide copy to clipboard button
function hideCopyToClipboardButton() {
  console.log('[POPUP_SCRIPT] hideCopyToClipboardButton called');
  const copyBtn = document.getElementById('copyTranscriptBtn');
  if (copyBtn) {
    copyBtn.style.display = 'none';
  }
}

// Save progressive transcript (called during recording)
function saveProgressiveTranscript(teamId, chunks, fullText) {
  try {
    console.log('[POPUP_SCRIPT] Saving progressive transcript');
    console.log('[POPUP_SCRIPT] Team ID:', teamId);
    console.log('[POPUP_SCRIPT] Chunks count:', chunks.length);
    
    if (!teamId || !chunks || chunks.length === 0) {
      console.warn('[POPUP_SCRIPT] Cannot save progressive transcript: missing data');
      return false;
    }
    
    // Get latest teams data
    const latestTeams = JSON.parse(localStorage.getItem('teams')) || [];
    const teamIndex = latestTeams.findIndex(team => team.id === teamId);
    
    if (teamIndex === -1) {
      console.warn('[POPUP_SCRIPT] Team not found for progressive save:', teamId);
      return false;
    }
    
    // Ensure team has transcripts array
    if (!latestTeams[teamIndex].transcripts) {
      latestTeams[teamIndex].transcripts = [];
    }
    
    // Check if we have a progressive transcript already
    const progressiveIndex = latestTeams[teamIndex].transcripts.findIndex(
      t => t.isProgressive === true
    );
    
    // Create transcript record
    const progressiveTranscript = {
      id: progressiveIndex >= 0 ? latestTeams[teamIndex].transcripts[progressiveIndex].id : `progressive_${Date.now()}`,
      date: progressiveIndex >= 0 ? latestTeams[teamIndex].transcripts[progressiveIndex].date : new Date().toISOString(),
      text: fullText,
      chunks: JSON.parse(JSON.stringify(chunks)),
      isProgressive: true,
      lastUpdated: new Date().toISOString()
    };
    
    if (progressiveIndex >= 0) {
      // Update existing progressive transcript
      latestTeams[teamIndex].transcripts[progressiveIndex] = progressiveTranscript;
      console.log('[POPUP_SCRIPT] Updated existing progressive transcript');
    } else {
      // Add new progressive transcript
      latestTeams[teamIndex].transcripts.push(progressiveTranscript);
      console.log('[POPUP_SCRIPT] Added new progressive transcript');
    }
    
    // Save to localStorage
    localStorage.setItem('teams', JSON.stringify(latestTeams));
    activeTeams = latestTeams;
    console.log('[POPUP_SCRIPT] Progressive transcript saved successfully');
    return true;
  } catch (error) {
    console.error('[POPUP_SCRIPT] Error saving progressive transcript:', error);
    return false;
  }
}

// Check and process pending saves from background
async function checkAndProcessPendingSaves() {
  console.log('[POPUP_SCRIPT] Checking for pending saves from background');
  
  try {
    // Check for pending saves
    const hasPendingSaves = await new Promise((resolve) => {
      chrome.storage.local.get(['has_pending_saves', 'pending_transcript_saves', 'progressive_transcript_save'], (result) => {
        resolve(result);
      });
    });
    
    if (!hasPendingSaves.has_pending_saves) {
      console.log('[POPUP_SCRIPT] No pending saves found');
      return;
    }
    
    // Process progressive save first
    if (hasPendingSaves.progressive_transcript_save) {
      const progressiveData = hasPendingSaves.progressive_transcript_save;
      console.log('[POPUP_SCRIPT] Found progressive save to process');
      
      const saved = saveProgressiveTranscript(
        progressiveData.teamId,
        progressiveData.transcriptChunks,
        progressiveData.transcriptChunks
          .filter(chunk => chunk.type === 'transcription' && chunk.text)
          .map(chunk => chunk.text)
          .join(' ')
      );
      
      if (saved) {
        // Clear the progressive save
        chrome.storage.local.remove(['progressive_transcript_save']);
      }
    }
    
    // Process pending final saves
    if (hasPendingSaves.pending_transcript_saves && hasPendingSaves.pending_transcript_saves.length > 0) {
      console.log('[POPUP_SCRIPT] Found', hasPendingSaves.pending_transcript_saves.length, 'pending saves to process');
      
      let successCount = 0;
      const remainingSaves = [];
      
      for (const pendingSave of hasPendingSaves.pending_transcript_saves) {
        console.log('[POPUP_SCRIPT] Processing pending save for team:', pendingSave.teamId);
        
        // Get latest teams data
        const latestTeams = JSON.parse(localStorage.getItem('teams')) || [];
        const teamIndex = latestTeams.findIndex(team => team.id === pendingSave.teamId);
        
        if (teamIndex === -1) {
          console.warn('[POPUP_SCRIPT] Team not found for pending save:', pendingSave.teamId);
          continue;
        }
        
        // Ensure team has transcripts array
        if (!latestTeams[teamIndex].transcripts) {
          latestTeams[teamIndex].transcripts = [];
        }
        
        // Remove any progressive transcript when saving final
        latestTeams[teamIndex].transcripts = latestTeams[teamIndex].transcripts.filter(
          t => !t.isProgressive
        );
        
        // Add the transcript
        latestTeams[teamIndex].transcripts.push(pendingSave.transcript);
        
        try {
          localStorage.setItem('teams', JSON.stringify(latestTeams));
          activeTeams = latestTeams;
          successCount++;
          console.log('[POPUP_SCRIPT] Successfully saved pending transcript for team:', pendingSave.teamId);
        } catch (error) {
          console.error('[POPUP_SCRIPT] Failed to save pending transcript:', error);
          remainingSaves.push(pendingSave);
        }
      }
      
      // Update storage with remaining saves or clear if all processed
      if (remainingSaves.length > 0) {
        chrome.storage.local.set({ 'pending_transcript_saves': remainingSaves });
      } else {
        chrome.storage.local.remove(['pending_transcript_saves', 'has_pending_saves']);
      }
      
      if (successCount > 0) {
        showPopupMessage(`Successfully recovered ${successCount} transcript(s) from background saves`, 'success', 5000);
      }
    }
  } catch (error) {
    console.error('[POPUP_SCRIPT] Error processing pending saves:', error);
  }
}

// Initialize STT provider selection
function initializeSTTProviderSelection() {
  const providerSelect = document.getElementById('sttProviderSelect');
  const modelSelect = document.getElementById('sttModelSelect');
  const customEndpointGroup = document.getElementById('customEndpointGroup');
  const customModelGroup = document.getElementById('customModelGroup');
  const modelDescription = document.getElementById('modelDescription');
  
  // Provider change handler
  providerSelect.addEventListener('change', function() {
    const selectedProvider = this.value;
    const provider = STT_PROVIDERS[selectedProvider];
    
    // Show/hide custom endpoint input
    customEndpointGroup.style.display = selectedProvider === 'custom' ? 'block' : 'none';
    
    // Clear and populate model dropdown
    modelSelect.innerHTML = '<option value="">Select a model...</option>';
    
    if (provider && provider.models.length > 0) {
      // Add predefined models
      provider.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.name;
        modelSelect.appendChild(option);
      });
      
      // Add custom model option for all providers
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom Model...';
      modelSelect.appendChild(customOption);
      
      customModelGroup.style.display = 'none';
    } else if (selectedProvider === 'custom') {
      // For custom provider, only show custom model input
      customModelGroup.style.display = 'block';
      modelDescription.textContent = 'Enter any OpenAI-compatible model name';
    }
    
    // Update endpoint based on provider
    if (selectedProvider !== 'custom' && provider) {
      localStorage.setItem('openai_stt_api_endpoint', provider.endpoint);
      
      // Also update the hidden input field for compatibility
      const endpointInput = document.getElementById('sttApiEndpointInput');
      if (endpointInput) {
        endpointInput.value = provider.endpoint;
      }
    }
    
    // Save provider selection
    localStorage.setItem('stt_provider', selectedProvider);
  });
  
  // Model change handler
  modelSelect.addEventListener('change', function() {
    const selectedModel = this.value;
    const selectedProvider = providerSelect.value;
    const provider = STT_PROVIDERS[selectedProvider];
    
    if (selectedModel === 'custom') {
      customModelGroup.style.display = 'block';
      modelDescription.textContent = '';
    } else {
      customModelGroup.style.display = 'none';
      
      // Show model description
      if (provider && provider.models) {
        const modelInfo = provider.models.find(m => m.value === selectedModel);
        if (modelInfo) {
          modelDescription.textContent = modelInfo.description;
        }
      }
      
      // Save model to storage
      if (selectedModel) {
        localStorage.setItem('openai_transcription_model', selectedModel);
        // Update hidden input
        const modelInput = document.getElementById('sttModelInput');
        if (modelInput) {
          modelInput.value = selectedModel;
        }
      }
    }
  });
  
  // Custom model input handler
  const customModelInput = document.getElementById('sttModelInput');
  if (customModelInput) {
    customModelInput.addEventListener('input', function() {
      if (this.value) {
        localStorage.setItem('openai_transcription_model', this.value);
      }
    });
  }
  
  // Custom endpoint input handler
  const customEndpointInput = document.getElementById('sttApiEndpointInput');
  if (customEndpointInput) {
    customEndpointInput.addEventListener('input', function() {
      localStorage.setItem('openai_stt_api_endpoint', this.value);
    });
  }
}

// Load STT provider settings
function loadSTTProviderSettings(savedEndpoint, savedModel) {
  const providerSelect = document.getElementById('sttProviderSelect');
  const modelSelect = document.getElementById('sttModelSelect');
  const modelInput = document.getElementById('sttModelInput');
  const endpointInput = document.getElementById('sttApiEndpointInput');
  const customEndpointGroup = document.getElementById('customEndpointGroup');
  const customModelGroup = document.getElementById('customModelGroup');
  
  // Load saved provider or determine from endpoint
  let savedProvider = localStorage.getItem('stt_provider');
  
  if (!savedProvider && savedEndpoint) {
    // Try to determine provider from endpoint
    for (const [key, provider] of Object.entries(STT_PROVIDERS)) {
      if (provider.endpoint && savedEndpoint.includes(provider.endpoint)) {
        savedProvider = key;
        break;
      }
    }
    if (!savedProvider) {
      savedProvider = 'custom';
    }
  } else if (!savedProvider) {
    savedProvider = 'openai'; // Default
  }
  
  // Set provider selection
  providerSelect.value = savedProvider;
  
  // Set endpoint for custom provider
  if (savedProvider === 'custom') {
    customEndpointGroup.style.display = 'block';
    endpointInput.value = savedEndpoint || '';
  } else {
    customEndpointGroup.style.display = 'none';
    const provider = STT_PROVIDERS[savedProvider];
    if (provider) {
      endpointInput.value = provider.endpoint;
    }
  }
  
  // Populate model dropdown
  const provider = STT_PROVIDERS[savedProvider];
  modelSelect.innerHTML = '<option value="">Select a model...</option>';
  
  if (provider && provider.models.length > 0) {
    let modelFound = false;
    
    provider.models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.name;
      modelSelect.appendChild(option);
      
      if (model.value === savedModel) {
        modelFound = true;
      }
    });
    
    // Add custom option
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom Model...';
    modelSelect.appendChild(customOption);
    
    // Set model selection
    if (modelFound) {
      modelSelect.value = savedModel;
      // Show description
      const modelInfo = provider.models.find(m => m.value === savedModel);
      if (modelInfo) {
        document.getElementById('modelDescription').textContent = modelInfo.description;
      }
    } else if (savedModel) {
      // Model not in predefined list, use custom
      modelSelect.value = 'custom';
      customModelGroup.style.display = 'block';
      modelInput.value = savedModel;
    }
  } else {
    // Custom provider
    customModelGroup.style.display = 'block';
    modelInput.value = savedModel || '';
  }
  
  // Also update the STT API key field
  const sttApiKeyInput = document.getElementById('sttApiKeyInput');
  if (sttApiKeyInput) {
    sttApiKeyInput.value = localStorage.getItem('openai_stt_api_key') || '';
  }
}

// Auto copy transcript to clipboard when stop recording
async function autoCopyTranscriptToClipboard() {
  console.log('[POPUP_SCRIPT] Auto copying transcript to clipboard');
  
  try {
    // Build transcript content
    let content = '';
    const team = activeTeams.find(t => t.id === currentState.activeTeamId);
    const teamName = team ? team.name : 'Unknown Team';
    const date = new Date();
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    
    content += `${teamName} - ${formattedDate}\n\n`;
    
    // Add transcript chunks
    if (transcriptChunks.length > 0) {
      transcriptChunks.forEach(chunk => {
        const chunkDate = new Date(chunk.timestamp);
        const formattedTime = `${chunkDate.getHours().toString().padStart(2, '0')}:${chunkDate.getMinutes().toString().padStart(2, '0')}:${chunkDate.getSeconds().toString().padStart(2, '0')}`;
        
        if (chunk.type === 'screenshot' || chunk.type === 'screenshot_analysis') {
          content += `[${formattedTime}] [Screenshot Analysis] ${chunk.analysis}\n\n`;
        } else {
          content += `[${formattedTime}] ${chunk.text || chunk.analysis || ''}\n\n`;
        }
      });
    }
    
    // Auto-copy always uses raw transcript content (no user prompt template)
    const finalContent = content;
    
    // Copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(finalContent);
      showPopupMessage('✅ 轉錄內容已自動複製到剪貼板！', 'success', 3000);
      console.log('[POPUP_SCRIPT] Transcript auto-copied to clipboard successfully');
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = finalContent;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        if (successful) {
          showPopupMessage('✅ Transcript automatically copied to clipboard!', 'success', 3000);
          console.log('[POPUP_SCRIPT] Transcript auto-copied to clipboard (fallback method)');
        } else {
          throw new Error('Copy command failed');
        }
      } catch (err) {
        console.error('[POPUP_SCRIPT] Failed to copy using fallback method:', err);
        showPopupMessage('❌ Auto-copy failed, please copy manually', 'error', 3000);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  } catch (error) {
    console.error('[POPUP_SCRIPT] Error auto-copying transcript:', error);
    showPopupMessage('❌ Auto-copy failed, please copy manually', 'error', 3000);
  }
}

// Multiple Prompt Template Management
function initializePromptTemplates() {
  const promptTemplateSelect = document.getElementById('promptTemplateSelect');
  const newTemplateBtn = document.getElementById('newTemplateBtn');
  const deleteTemplateBtn = document.getElementById('deleteTemplateBtn');
  const saveTemplateBtn = document.getElementById('saveTemplateBtn');
  const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
  const templateEditor = document.getElementById('templateEditor');
  const templateNameInput = document.getElementById('templateName');
  const userPromptTemplateInput = document.getElementById('userPromptTemplate');
  
  // Load saved templates
  let promptTemplates = JSON.parse(localStorage.getItem('prompt_templates') || '{}');
  let selectedTemplateId = localStorage.getItem('selected_template_id') || '';
  
  // Default templates if none exist
  if (Object.keys(promptTemplates).length === 0) {
    promptTemplates = {
      'meeting_summary': {
        id: 'meeting_summary',
        name: 'Meeting Summary',
        template: 'Please provide a comprehensive summary of the following meeting:\n\n{context}\n\nInclude:\n1. Key discussion points\n2. Action items with responsible parties\n3. Decisions made\n4. Next steps and deadlines\n5. Any important notes or concerns raised'
      },
      'technical_review': {
        id: 'technical_review',
        name: 'Technical Review',
        template: 'Analyze the technical discussion and provide recommendations from:\n\n{context}\n\nFocus on:\n1. Technical decisions made\n2. Architecture or design choices\n3. Technical challenges discussed\n4. Proposed solutions\n5. Technical action items'
      },
      'project_status': {
        id: 'project_status',
        name: 'Project Status',
        template: 'Extract project updates and status from:\n\n{context}\n\nProvide:\n1. Current project status\n2. Progress on milestones\n3. Blockers or issues\n4. Resource needs\n5. Timeline updates'
      }
    };
    localStorage.setItem('prompt_templates', JSON.stringify(promptTemplates));
  }
  
  // Populate template dropdown
  function loadTemplateDropdown() {
    promptTemplateSelect.innerHTML = '<option value="">-- Select a template --</option>';
    
    Object.values(promptTemplates).forEach(template => {
      const option = document.createElement('option');
      option.value = template.id;
      option.textContent = template.name;
      promptTemplateSelect.appendChild(option);
    });
    
    if (selectedTemplateId && promptTemplates[selectedTemplateId]) {
      promptTemplateSelect.value = selectedTemplateId;
      deleteTemplateBtn.disabled = false;
    } else {
      deleteTemplateBtn.disabled = true;
    }
  }
  
  // Load template into editor
  function loadTemplate(templateId) {
    if (templateId && promptTemplates[templateId]) {
      const template = promptTemplates[templateId];
      templateNameInput.value = template.name;
      userPromptTemplateInput.value = template.template;
      templateEditor.style.display = 'block';
      deleteTemplateBtn.disabled = false;
    } else {
      templateEditor.style.display = 'none';
      deleteTemplateBtn.disabled = true;
    }
  }
  
  // Template selection change
  promptTemplateSelect.addEventListener('change', function() {
    selectedTemplateId = this.value;
    localStorage.setItem('selected_template_id', selectedTemplateId);
    loadTemplate(selectedTemplateId);
  });
  
  // New template button
  newTemplateBtn.addEventListener('click', function() {
    const newId = 'template_' + Date.now();
    selectedTemplateId = newId;
    promptTemplateSelect.value = '';
    templateNameInput.value = '';
    userPromptTemplateInput.value = '';
    templateEditor.style.display = 'block';
    deleteTemplateBtn.disabled = true;
  });
  
  // Save template button
  saveTemplateBtn.addEventListener('click', function() {
    const name = templateNameInput.value.trim();
    const template = userPromptTemplateInput.value.trim();
    
    if (!name) {
      showPopupMessage('Please enter a template name', 'error');
      return;
    }
    
    if (!template) {
      showPopupMessage('Please enter a template', 'error');
      return;
    }
    
    promptTemplates[selectedTemplateId] = {
      id: selectedTemplateId,
      name: name,
      template: template
    };
    
    localStorage.setItem('prompt_templates', JSON.stringify(promptTemplates));
    localStorage.setItem('selected_template_id', selectedTemplateId);
    
    loadTemplateDropdown();
    promptTemplateSelect.value = selectedTemplateId;
    showPopupMessage('Template saved successfully!', 'success');
  });
  
  // Cancel button
  cancelTemplateBtn.addEventListener('click', function() {
    loadTemplate(selectedTemplateId);
    if (!selectedTemplateId) {
      templateEditor.style.display = 'none';
    }
  });
  
  // Delete template button
  deleteTemplateBtn.addEventListener('click', function() {
    if (!selectedTemplateId || !promptTemplates[selectedTemplateId]) {
      showPopupMessage('No template selected to delete', 'error');
      return;
    }
    
    const template = promptTemplates[selectedTemplateId];
    if (confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      delete promptTemplates[selectedTemplateId];
      localStorage.setItem('prompt_templates', JSON.stringify(promptTemplates));
      
      selectedTemplateId = '';
      localStorage.removeItem('selected_template_id');
      
      loadTemplateDropdown();
      templateEditor.style.display = 'none';
      showPopupMessage('Template deleted successfully', 'success');
    }
  });
  
  // Initialize
  loadTemplateDropdown();
  if (selectedTemplateId) {
    loadTemplate(selectedTemplateId);
  }
}

// Initialize prompt templates when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  initializePromptTemplates();
  initializeRunAnalysisButton();
});

// Initialize Run AI Analysis button
function initializeRunAnalysisButton() {
  const runAnalysisBtn = document.getElementById('runAnalysisBtn');
  const transcriptContainer = document.getElementById('transcriptContainer');
  
  if (!runAnalysisBtn) return;
  
  // Show/hide button based on transcript content
  function updateAnalysisButtonVisibility() {
    if (transcriptContainer && transcriptContainer.textContent.trim()) {
      runAnalysisBtn.style.display = 'inline-block';
    } else {
      runAnalysisBtn.style.display = 'none';
    }
  }
  
  // Update visibility when transcript changes
  if (transcriptContainer) {
    const observer = new MutationObserver(updateAnalysisButtonVisibility);
    observer.observe(transcriptContainer, { childList: true, subtree: true });
  }
  
  // Initial visibility check
  updateAnalysisButtonVisibility();
  
  // Handle button click
  runAnalysisBtn.addEventListener('click', async function() {
    try {
      // Get current transcript content
      const transcriptChunks = document.querySelectorAll('.transcript-chunk');
      if (transcriptChunks.length === 0) {
        showPopupMessage('No transcript available to analyze', 'error');
        return;
      }
      
      // Collect all transcript text
      let transcriptContent = '';
      transcriptChunks.forEach(chunk => {
        const timeEl = chunk.querySelector('.chunk-time');
        const textEl = chunk.querySelector('.chunk-text');
        if (timeEl && textEl) {
          transcriptContent += `[${timeEl.textContent}] ${textEl.textContent}\n`;
        }
      });
      
      if (!transcriptContent.trim()) {
        showPopupMessage('No transcript content found', 'error');
        return;
      }
      
      // Get selected template from the dropdown
      const promptTemplateSelect = document.getElementById('promptTemplateSelect');
      const selectedTemplateId = promptTemplateSelect ? promptTemplateSelect.value : '';
      const promptTemplates = JSON.parse(localStorage.getItem('prompt_templates') || '{}');
      let userPromptTemplate = '';
      
      if (selectedTemplateId && promptTemplates[selectedTemplateId]) {
        // Use the currently selected template from dropdown
        userPromptTemplate = promptTemplates[selectedTemplateId].template;
        console.log('[Run AI Analysis] Using selected template:', promptTemplates[selectedTemplateId].name);
      } else {
        // If no template is selected in dropdown, check if there's at least one template
        const templateIds = Object.keys(promptTemplates);
        if (templateIds.length > 0) {
          // Use the first available template
          userPromptTemplate = promptTemplates[templateIds[0]].template;
          console.log('[Run AI Analysis] No template selected, using first available:', promptTemplates[templateIds[0]].name);
        } else {
          // No templates exist, use default
          userPromptTemplate = DEFAULT_USER_PROMPT_TEMPLATE;
          console.log('[Run AI Analysis] No templates found, using default template');
        }
      }
      
      if (!userPromptTemplate || !userPromptTemplate.includes('{context}')) {
        showPopupMessage('Please configure a valid prompt template with {context} placeholder', 'error');
        return;
      }
      
      // Check API configuration
      const apiKey = await secureGetItem('openai_api_key');
      if (!apiKey) {
        showPopupMessage('Please configure your API key first', 'error');
        return;
      }
      
      // Show loading state
      runAnalysisBtn.disabled = true;
      runAnalysisBtn.textContent = 'Analyzing...';
      showPopupMessage('Running AI analysis...', 'success');
      
      // Process with API
      const apiService = window.APIService;
      if (!apiService) {
        throw new Error('API service not initialized');
      }
      
      const result = await apiService.processWithUserPrompt(userPromptTemplate, transcriptContent);
      
      // Open result in new window
      const resultWindow = window.open('', '_blank', 'width=800,height=600');
      resultWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI Analysis Result</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
              color: #333;
              border-bottom: 2px solid #007bff;
              padding-bottom: 10px;
            }
            h2 {
              color: #555;
              margin-top: 25px;
            }
            h3 {
              color: #666;
              margin-top: 20px;
            }
            pre {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
              white-space: pre-wrap;
            }
            .timestamp {
              color: #666;
              font-size: 0.9em;
              margin-bottom: 20px;
            }
            ul, ol {
              margin-left: 20px;
            }
            li {
              margin-bottom: 8px;
            }
            .copy-btn {
              background: #007bff;
              color: white;
              border: none;
              padding: 8px 16px;
              border-radius: 5px;
              cursor: pointer;
              margin-top: 20px;
            }
            .copy-btn:hover {
              background: #0056b3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>AI Analysis Result</h1>
            <div class="timestamp">Generated at: ${new Date().toLocaleString()}</div>
            <div id="content">${marked.parse ? marked.parse(result) : result.replace(/\n/g, '<br>')}</div>
            <button class="copy-btn" onclick="copyToClipboard()">Copy to Clipboard</button>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
          <script>
            function copyToClipboard() {
              const content = document.getElementById('content').innerText;
              navigator.clipboard.writeText(content).then(() => {
                alert('Content copied to clipboard!');
              }).catch(err => {
                console.error('Failed to copy:', err);
              });
            }
            
            // Parse markdown if marked is available
            if (typeof marked !== 'undefined' && !document.getElementById('content').innerHTML.includes('<')) {
              document.getElementById('content').innerHTML = marked.parse(${JSON.stringify(result)});
            }
          </script>
        </body>
        </html>
      `);
      
      showPopupMessage('Analysis complete!', 'success');
    } catch (error) {
      console.error('AI analysis error:', error);
      showPopupMessage(`Analysis failed: ${error.message}`, 'error', 5000);
    } finally {
      // Reset button state
      runAnalysisBtn.disabled = false;
      runAnalysisBtn.textContent = 'Run AI Analysis';
    }
  });
}
