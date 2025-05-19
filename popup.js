// 彈出窗口狀態管理
let popupState = {
  isCapturing: false,
  activeTeamId: null,
  teams: []
};

// 初始化彈出窗口
async function initializePopup() {
  try {
    // 初始化設置
    await initializeSettings();
    
    // 加載團隊列表
    await loadTeams();
    
    // 獲取當前捕獲狀態
    await updateCaptureState();
    
    // 設置事件監聽器
    setupEventListeners();
  } catch (error) {
    console.error('Popup initialization failed:', error);
    showError('Initialization failed, please try again');
  }
}

// 加載團隊列表
async function loadTeams() {
  try {
    // 測試用假資料
    popupState.teams = [
      { id: 'team1', name: 'Team 1' },
      { id: 'team2', name: 'Team 2' },
      { id: 'team3', name: 'Team 3' }
    ];
    
    const teamSelector = document.getElementById('teamSelector');
    if (!teamSelector) return;
    
    // 清空現有選項
    teamSelector.innerHTML = '';
    
    // 添加默認選項
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select Team';
    teamSelector.appendChild(defaultOption);
    
    // 添加團隊選項
    popupState.teams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelector.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load teams:', error);
    throw error;
  }
}

// 更新捕獲狀態
async function updateCaptureState() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCaptureState' });
    popupState.isCapturing = response.isCapturing;
    popupState.activeTeamId = response.activeTeamId;
    
    updateUI();
  } catch (error) {
    console.error('獲取捕獲狀態失敗:', error);
    throw error;
  }
}

// 更新UI顯示
function updateUI() {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const statusElement = document.getElementById('status');
  const teamSelector = document.getElementById('teamSelector');
  
  if (startButton) {
    startButton.disabled = popupState.isCapturing;
  }
  
  if (stopButton) {
    stopButton.disabled = !popupState.isCapturing;
  }
  
  if (statusElement) {
    statusElement.textContent = popupState.isCapturing ? 'Recording...' : 'Ready';
    statusElement.className = `status ${popupState.isCapturing ? 'recording' : 'idle'}`;
  }
  
  if (teamSelector) {
    teamSelector.value = popupState.activeTeamId || '';
    teamSelector.disabled = popupState.isCapturing;
  }
}

// 設置事件監聽器
function setupEventListeners() {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const teamSelector = document.getElementById('teamSelector');
  
  if (startButton) {
    startButton.addEventListener('click', handleStartCapture);
  }
  
  if (stopButton) {
    stopButton.addEventListener('click', handleStopCapture);
  }
  
  if (teamSelector) {
    teamSelector.addEventListener('change', handleTeamChange);
  }
}

// 處理開始捕獲
async function handleStartCapture() {
  try {
    if (!popupState.activeTeamId) {
      showError('Please select a team first');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'startCapture',
      options: {
        teamId: popupState.activeTeamId,
        captureMode: 'screen'
      }
    });
    
    if (response.success) {
      await updateCaptureState();
    } else {
      showError(response.error || 'Failed to start capture');
    }
  } catch (error) {
    console.error('Failed to start capture:', error);
    showError('Failed to start capture, please try again');
  }
}

// 處理停止捕獲
async function handleStopCapture() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'stopCapture'
    });
    
    if (response.success) {
      await updateCaptureState();
    } else {
      showError(response.error || 'Failed to stop capture');
    }
  } catch (error) {
    console.error('Failed to stop capture:', error);
    showError('Failed to stop capture, please try again');
  }
}

// 處理團隊變更
async function handleTeamChange(event) {
  try {
    const teamId = event.target.value;
    const response = await chrome.runtime.sendMessage({
      action: 'setActiveTeam',
      teamId: teamId
    });
    
    if (response.success) {
      popupState.activeTeamId = teamId;
    } else {
      showError('Failed to set team');
    }
  } catch (error) {
    console.error('Failed to set team:', error);
    showError('Failed to set team, please try again');
  }
}

// 顯示成功消息
function showSuccess(message) {
  console.log('Success:', message);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.className = 'status-text success';
    setTimeout(() => {
      status.textContent = 'Ready';
      status.className = 'status-text';
    }, 3000);
  }
  
  alert('✅ Success: ' + message);
}

// 顯示錯誤消息
function showError(message) {
  console.error('Error:', message);
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    status.className = 'status-text error';
    setTimeout(() => {
      status.textContent = 'Ready';
      status.className = 'status-text';
    }, 3000);
  }
  
  alert('❌ Error: ' + message);
}

// 監聽來自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureStateChanged') {
    popupState.isCapturing = message.state.isCapturing;
    updateUI();
  }
});

// 當文檔加載完成時初始化彈出窗口
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM Content Loaded');
  
  // 初始化彈出窗口
  initializePopup();
  
  // 設置設置按鈕的點擊事件
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    console.log('Attaching click handler to settings button');
    settingsBtn.addEventListener('click', function() {
      console.log('Settings button clicked');
      // 隱藏歷史面板
      const historyPanel = document.getElementById('historyPanel');
      if (historyPanel) {
        historyPanel.classList.add('hidden');
      }
      
      // 切換設置面板顯示/隱藏
      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel) {
        const isHidden = settingsPanel.classList.contains('hidden');
        console.log('Settings panel visibility:', isHidden ? 'hidden' : 'visible');
        settingsPanel.classList.toggle('hidden');
        console.log('Settings panel visibility after toggle:', settingsPanel.classList.contains('hidden') ? 'hidden' : 'visible');
      } else {
        console.error('Settings panel not found!');
      }
    });
  } else {
    console.error('Settings button not found!');
  }
  
  // 設置歷史記錄按鈕的點擊事件
  const showHistoryBtn = document.getElementById('showHistoryBtn');
  if (showHistoryBtn) {
    console.log('Attaching click handler to history button');
    showHistoryBtn.addEventListener('click', function() {
      console.log('History button clicked');
      // 隱藏設置面板
      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel) {
        settingsPanel.classList.add('hidden');
      }
      
      // 切換歷史面板顯示/隱藏
      const historyPanel = document.getElementById('historyPanel');
      if (historyPanel) {
        historyPanel.classList.toggle('hidden');
        
        // 如果顯示了歷史面板，則載入歷史記錄
        if (!historyPanel.classList.contains('hidden')) {
          loadMeetingHistory();
        }
      }
    });
  }
  
  // 設置刷新歷史按鈕的點擊事件
  const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
  if (refreshHistoryBtn) {
    refreshHistoryBtn.addEventListener('click', function() {
      loadMeetingHistory();
    });
  }
  
  // 設置保存設置按鈕的點擊事件
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    console.log('Attaching click handler to save settings button');
    saveSettingsBtn.addEventListener('click', handleSaveSettings);
  }
});

// 初始化設置
async function initializeSettings() {
  try {
    // 等待 APIService 初始化完成
    if (!window.APIService) {
      await new Promise((resolve, reject) => {
        const checkAPIService = setInterval(() => {
          if (window.APIService) {
            clearInterval(checkAPIService);
            resolve();
          }
        }, 100);

        // 設置超時
        setTimeout(() => {
          clearInterval(checkAPIService);
          reject(new Error('APIService initialization timeout'));
        }, 5000);
      });
    }

    const settings = await window.APIService.loadSettings();
    
    // 填充設置表單
    document.getElementById('apiEndpointInput').value = settings?.apiEndpoint || 'https://api.openai.com/v1';
    document.getElementById('apiKeyInput').value = settings?.apiKey || '';
    
    // 設置預設模型為 gpt-4.1-nano
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
      // 清空現有選項
      modelSelect.innerHTML = '';
      
      // 添加預設模型選項
      const defaultOption = document.createElement('option');
      defaultOption.value = 'gpt-4.1-nano';
      defaultOption.textContent = 'gpt-4.1-nano';
      modelSelect.appendChild(defaultOption);
      
      // 如果有已保存的設置，使用保存的模型
      if (settings?.model) {
        modelSelect.value = settings.model;
      } else {
        modelSelect.value = 'gpt-4.1-nano';
      }
    }
    
    // 設置事件監聽器
    setupSettingsListeners();
  } catch (error) {
    console.error('Failed to initialize settings:', error);
    showError(error.message || 'Failed to load settings');
  }
}

// 設置事件監聽器
function setupSettingsListeners() {
  console.log('Setting up event listeners...');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const apiEndpointInput = document.getElementById('apiEndpointInput');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  
  console.log('Found form elements:', {
    testConnectionBtn: !!testConnectionBtn,
    saveSettingsBtn: !!saveSettingsBtn,
    settingsBtn: !!settingsBtn,
    apiEndpointInput: !!apiEndpointInput,
    apiKeyInput: !!apiKeyInput,
    modelSelect: !!modelSelect
  });

  // 添加輸入監聽器，當設置改變時啟用保存按鈕
  const enableSaveButton = () => {
    if (saveSettingsBtn) {
      saveSettingsBtn.disabled = false;
      saveSettingsBtn.textContent = 'Save Settings';
    }
  };

  if (apiEndpointInput) {
    apiEndpointInput.addEventListener('input', enableSaveButton);
  }
  if (apiKeyInput) {
    apiKeyInput.addEventListener('input', enableSaveButton);
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', enableSaveButton);
  }
  
  if (testConnectionBtn) {
    console.log('Adding click listener to test connection button');
    testConnectionBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log('Test connection button clicked');
      
      const settingsPanel = document.getElementById('settingsPanel');
      if (settingsPanel && settingsPanel.classList.contains('hidden')) {
        console.log('Settings panel is hidden, showing it...');
        settingsPanel.classList.remove('hidden');
      }
      
      testConnectionBtn.disabled = true;
      testConnectionBtn.textContent = 'Testing...';
      
      try {
        await handleTestConnection();
      } catch (error) {
        console.error('Test connection failed:', error);
        showError(error.message || 'Connection test failed');
      } finally {
        testConnectionBtn.disabled = false;
        testConnectionBtn.textContent = 'Test Connection';
      }
    });
  } else {
    console.error('Test connection button not found!');
  }
  
  if (saveSettingsBtn) {
    console.log('Adding click listener to save settings button');
    saveSettingsBtn.addEventListener('click', async (event) => {
      event.preventDefault();
      console.log('Save settings button clicked');
      await handleSaveSettings();
    });
  } else {
    console.error('Save settings button not found!');
  }
}

// 處理保存設置
async function handleSaveSettings() {
  console.log('Starting to save settings...');
  try {
    const apiEndpoint = document.getElementById('apiEndpointInput')?.value?.trim();
    const apiKey = document.getElementById('apiKeyInput')?.value?.trim();
    const model = document.getElementById('modelSelect')?.value;

    console.log('Form values:', {
      apiEndpoint: apiEndpoint ? `${apiEndpoint.substring(0, 10)}...` : null,
      apiKeyLength: apiKey ? apiKey.length : 0,
      model
    });

    if (!apiEndpoint || !apiKey) {
      const errorDetails = {
        apiEndpoint: {
          provided: !!apiEndpoint,
          value: apiEndpoint
        },
        apiKey: {
          provided: !!apiKey,
          length: apiKey ? apiKey.length : 0
        }
      };
      console.error('Missing required settings:', errorDetails);
      throw new Error('API Endpoint and API Key are required');
    }

    if (!model) {
      console.error('Model not selected');
      throw new Error('Please select a model');
    }

    if (!window.APIService) {
      console.error('APIService not available!', {
        windowKeys: Object.keys(window),
        hasAPIService: 'APIService' in window,
        type: typeof window.APIService
      });
      throw new Error('API service not initialized');
    }

    const settings = {
      apiEndpoint,
      apiKey,
      model
    };

    console.log('Saving settings...', {
      apiEndpoint: `${apiEndpoint.substring(0, 10)}...`,
      apiKeyLength: apiKey.length,
      model
    });

    await window.APIService.saveSettings(settings);
    
    console.log('Settings saved successfully');
    
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.disabled = true;
      saveSettingsBtn.textContent = 'Saved';
      setTimeout(() => {
        saveSettingsBtn.disabled = false;
        saveSettingsBtn.textContent = 'Save Settings';
      }, 2000);
    }

    showSuccess('Settings saved successfully');
  } catch (error) {
    console.error('Failed to save settings:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    showError(error.message || 'Failed to save settings');
  }
}

// 處理測試連接
async function handleTestConnection() {
  console.log('Starting test connection...');
  try {
    const endpoint = document.getElementById('apiEndpointInput').value.trim();
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    
    console.log('Test connection parameters:', {
      endpoint,
      apiKeyLength: apiKey ? apiKey.length : 0
    });
    
    if (!endpoint || !apiKey) {
      const errorDetails = {
        endpoint: {
          provided: !!endpoint,
          value: endpoint
        },
        apiKey: {
          provided: !!apiKey,
          length: apiKey ? apiKey.length : 0
        }
      };
      console.error('Missing required parameters:', errorDetails);
      throw new Error('Please enter API Endpoint and API Key');
    }
    
    console.log('Checking APIService availability...');
    if (!window.APIService) {
      console.error('APIService not available!', {
        windowKeys: Object.keys(window),
        hasAPIService: 'APIService' in window,
        type: typeof window.APIService
      });
      throw new Error('API service not initialized');
    }
    
    console.log('Setting temporary API key...');
    window.APIService.settings.apiKey = apiKey;
    
    console.log('Validating endpoint...');
    const result = await window.APIService.validateEndpoint(endpoint);
    console.log('Validation result:', {
      valid: result.valid,
      error: result.error,
      modelsCount: result.models ? result.models.length : 0,
      models: result.models,
      fullResult: result
    });
    
    if (result.valid) {
      console.log('Connection successful!');
      console.log('Available models:', result.models);
      
      const modelSelect = document.getElementById('modelSelect');
      if (!modelSelect) {
        console.error('Model select element not found!', {
          availableElements: document.querySelectorAll('select').length,
          elementIds: Array.from(document.querySelectorAll('select')).map(el => el.id)
        });
        throw new Error('Model selector not found');
      }
      
      modelSelect.innerHTML = '';
      console.log('Updating model selector with available models...');
      
      result.models.forEach(model => {
        console.log('Adding model option:', model);
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });
      
      const savedModel = window.APIService.settings.model;
      if (savedModel && result.models.includes(savedModel)) {
        console.log('Selecting saved model:', savedModel);
        modelSelect.value = savedModel;
      } else {
        console.log('No saved model found or saved model not in available models', {
          savedModel,
          availableModels: result.models,
          isSavedModelAvailable: savedModel ? result.models.includes(savedModel) : false
        });
      }
      
      console.log('Model selector update complete. Current value:', modelSelect.value);
      showSuccess('Connection successful! Available models updated');
    } else {
      const errorDetails = {
        validationResult: result,
        endpoint,
        apiKeyLength: apiKey.length,
        timestamp: new Date().toISOString()
      };
      console.error('Connection validation failed:', errorDetails);
      throw new Error(result.error || 'Connection failed');
    }
  } catch (error) {
    const errorDetails = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      endpoint: document.getElementById('apiEndpointInput')?.value,
      apiKeyLength: document.getElementById('apiKeyInput')?.value?.length
    };
    console.error('Connection test failed:', errorDetails);
    showError(error.message || 'Connection test failed');
    throw error;
  }
}

// 載入會議歷史記錄
async function loadMeetingHistory() {
  try {
    console.log('Loading meeting history...');
    const historyContainer = document.getElementById('historyContainer');
    if (!historyContainer) {
      console.error('History container not found!');
      return;
    }
    
    // 顯示載入中提示
    historyContainer.innerHTML = '<div class="loading">Loading...</div>';
    
    // 獲取選定的團隊（如果有）
    const teamSelect = document.getElementById('historyTeamSelect');
    const selectedTeam = teamSelect ? teamSelect.value : '';
    
    // 模擬從資料庫載入歷史記錄
    const mockHistory = [
      {
        id: 'meeting1',
        teamId: 'team1',
        teamName: 'Team 1',
        date: new Date(Date.now() - 86400000),
        transcript: 'This is a sample meeting record. Here are some discussion points and meeting notes.'
      },
      {
        id: 'meeting2',
        teamId: 'team2',
        teamName: 'Team 2',
        date: new Date(Date.now() - 172800000),
        transcript: 'Second meeting record. The team discussed project progress and next steps.'
      },
      {
        id: 'meeting3',
        teamId: 'team1',
        teamName: 'Team 1',
        date: new Date(Date.now() - 259200000),
        transcript: 'Third meeting record. The team reviewed last week\'s achievements and assigned new tasks.'
      }
    ];
    
    // 根據選定的團隊過濾歷史記錄
    const filteredHistory = selectedTeam
      ? mockHistory.filter(item => item.teamId === selectedTeam)
      : mockHistory;
    
    if (filteredHistory.length === 0) {
      historyContainer.innerHTML = '<div class="empty-message">No meeting records found</div>';
      return;
    }
    
    // 渲染歷史記錄
    historyContainer.innerHTML = '';
    filteredHistory.forEach(meeting => {
      const dateStr = meeting.date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.dataset.id = meeting.id;
      historyItem.innerHTML = `
        <div class="history-item-header">
          <span class="history-item-team">${meeting.teamName}</span>
          <span class="history-item-date">${dateStr}</span>
        </div>
        <div class="history-item-preview">${meeting.transcript}</div>
      `;
      
      historyItem.addEventListener('click', () => {
        viewMeetingDetails(meeting);
      });
      
      historyContainer.appendChild(historyItem);
    });
    
  } catch (error) {
    console.error('Failed to load meeting history:', error);
    const historyContainer = document.getElementById('historyContainer');
    if (historyContainer) {
      historyContainer.innerHTML = '<div class="error-message">Failed to load history</div>';
    }
  }
}

// 查看會議詳細記錄
function viewMeetingDetails(meeting) {
  alert(`Meeting Details: ${meeting.teamName} - ${meeting.date.toLocaleString('en-US')}`);
} 