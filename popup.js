// 彈出窗口狀態管理
let popupState = {
  isCapturing: false,
  activeTeamId: null,
  teams: []
};

// 初始化彈出窗口
async function initializePopup() {
  try {
    // 加載團隊列表
    await loadTeams();
    
    // 獲取當前捕獲狀態
    await updateCaptureState();
    
    // 設置事件監聽器
    setupEventListeners();
  } catch (error) {
    console.error('彈出窗口初始化失敗:', error);
    showError('初始化失敗，請重試');
  }
}

// 加載團隊列表
async function loadTeams() {
  try {
    // TODO: 從存儲中加載團隊列表
    popupState.teams = [];
    
    const teamSelector = document.getElementById('teamSelector');
    if (!teamSelector) return;
    
    // 清空現有選項
    teamSelector.innerHTML = '';
    
    // 添加默認選項
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '選擇團隊';
    teamSelector.appendChild(defaultOption);
    
    // 添加團隊選項
    popupState.teams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelector.appendChild(option);
    });
  } catch (error) {
    console.error('加載團隊列表失敗:', error);
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
    statusElement.textContent = popupState.isCapturing ? '正在錄製...' : '就緒';
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
      showError('請先選擇團隊');
      return;
    }
    
    const response = await chrome.runtime.sendMessage({
      action: 'startCapture',
      options: {
        teamId: popupState.activeTeamId,
        captureMode: 'screen' // 或其他捕獲模式
      }
    });
    
    if (response.success) {
      await updateCaptureState();
    } else {
      showError(response.error || '開始捕獲失敗');
    }
  } catch (error) {
    console.error('開始捕獲失敗:', error);
    showError('開始捕獲失敗，請重試');
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
      showError(response.error || '停止捕獲失敗');
    }
  } catch (error) {
    console.error('停止捕獲失敗:', error);
    showError('停止捕獲失敗，請重試');
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
      showError('設置團隊失敗');
    }
  } catch (error) {
    console.error('設置團隊失敗:', error);
    showError('設置團隊失敗，請重試');
  }
}

// 顯示錯誤消息
function showError(message) {
  const errorElement = document.getElementById('error');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 3000);
  }
}

// 監聽來自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureStateChanged') {
    popupState.isCapturing = message.state.isCapturing;
    updateUI();
  }
});

// 當文檔加載完成時初始化彈出窗口
document.addEventListener('DOMContentLoaded', initializePopup);

// 初始化設置
async function initializeSettings() {
  try {
    const settings = await apiService.loadSettings();
    
    // 填充設置表單
    document.getElementById('apiEndpoint').value = settings.apiEndpoint || 'https://api.openai.com/v1';
    document.getElementById('apiKey').value = settings.apiKey || '';
    document.getElementById('model').value = settings.model || 'gpt-4-turbo-preview';
    document.getElementById('maxTokens').value = settings.maxTokens || 2000;
    document.getElementById('temperature').value = settings.temperature || 0.7;
    
    // 設置事件監聽器
    setupSettingsListeners();
  } catch (error) {
    console.error('Failed to initialize settings:', error);
    showError('Failed to load settings');
  }
}

// 設置事件監聽器
function setupSettingsListeners() {
  const saveButton = document.getElementById('saveSettings');
  const testButton = document.getElementById('testConnection');
  
  if (saveButton) {
    saveButton.addEventListener('click', handleSaveSettings);
  }
  
  if (testButton) {
    testButton.addEventListener('click', handleTestConnection);
  }
}

// 處理保存設置
async function handleSaveSettings() {
  try {
    const settings = {
      apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      model: document.getElementById('model').value,
      maxTokens: parseInt(document.getElementById('maxTokens').value),
      temperature: parseFloat(document.getElementById('temperature').value)
    };
    
    // 驗證設置
    if (!settings.apiEndpoint || !settings.apiKey) {
      throw new Error('API Endpoint and API Key are required');
    }
    
    // 保存設置
    await apiService.saveSettings(settings);
    showSuccess('Settings saved successfully');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showError(error.message);
  }
}

// 處理測試連接
async function handleTestConnection() {
  try {
    const endpoint = document.getElementById('apiEndpoint').value.trim();
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!endpoint || !apiKey) {
      throw new Error('API Endpoint and API Key are required');
    }
    
    // 顯示測試中狀態
    const testButton = document.getElementById('testConnection');
    const originalText = testButton.textContent;
    testButton.textContent = 'Testing...';
    testButton.disabled = true;
    
    // 驗證端點
    const result = await apiService.validateEndpoint(endpoint);
    
    if (result.valid) {
      showSuccess('Connection successful! Available models: ' + 
        result.models.map(m => m.id).join(', '));
    } else {
      throw new Error(result.error || 'Connection failed');
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    showError(error.message);
  } finally {
    // 恢復按鈕狀態
    const testButton = document.getElementById('testConnection');
    testButton.textContent = 'Test Connection';
    testButton.disabled = false;
  }
}

// 顯示成功消息
function showSuccess(message) {
  // TODO: 實現成功提示UI
  console.log('Success:', message);
}

// 顯示錯誤消息
function showError(message) {
  // TODO: 實現錯誤提示UI
  console.error('Error:', message);
}

// 當文檔加載完成時初始化
document.addEventListener('DOMContentLoaded', initializeSettings); 