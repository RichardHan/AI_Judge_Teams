// 儀表板狀態管理
let dashboardState = {
  teams: [],
  recordings: new Map(), // teamId -> recordings[]
  activeRecordings: new Set()
};

// 初始化儀表板
async function initializeDashboard() {
  try {
    // 從存儲中加載團隊數據
    const teams = await loadTeams();
    dashboardState.teams = teams;
    
    // 從存儲中加載錄製數據
    const recordings = await loadRecordings();
    dashboardState.recordings = recordings;
    
    // 渲染儀表板
    renderDashboard();
    
    // 設置定期更新
    setInterval(updateDashboard, 5000);
  } catch (error) {
    console.error('儀表板初始化失敗:', error);
    showError('儀表板加載失敗，請刷新頁面重試');
  }
}

// 加載團隊數據
async function loadTeams() {
  // TODO: 實現從存儲中加載團隊數據
  return [];
}

// 加載錄製數據
async function loadRecordings() {
  // TODO: 實現從存儲中加載錄製數據
  return new Map();
}

// 渲染儀表板
function renderDashboard() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return;

  // 渲染團隊卡片
  const teamGrid = document.createElement('div');
  teamGrid.className = 'team-grid';
  
  dashboardState.teams.forEach(team => {
    const teamCard = createTeamCard(team);
    teamGrid.appendChild(teamCard);
  });
  
  container.appendChild(teamGrid);
}

// 創建團隊卡片
function createTeamCard(team) {
  const card = document.createElement('div');
  card.className = 'team-card';
  
  const header = document.createElement('h2');
  header.textContent = team.name;
  
  const recordingsList = document.createElement('ul');
  recordingsList.className = 'recording-list';
  
  const teamRecordings = dashboardState.recordings.get(team.id) || [];
  teamRecordings.forEach(recording => {
    const recordingItem = createRecordingItem(recording);
    recordingsList.appendChild(recordingItem);
  });
  
  card.appendChild(header);
  card.appendChild(recordingsList);
  
  return card;
}

// 創建錄製項目
function createRecordingItem(recording) {
  const item = document.createElement('li');
  item.className = 'recording-item';
  
  const info = document.createElement('div');
  info.className = 'recording-info';
  
  const title = document.createElement('h3');
  title.className = 'recording-title';
  title.textContent = recording.title;
  
  const time = document.createElement('p');
  time.className = 'recording-time';
  time.textContent = new Date(recording.timestamp).toLocaleString();
  
  const actions = document.createElement('div');
  actions.className = 'recording-actions';
  
  const viewButton = document.createElement('button');
  viewButton.className = 'action-button view-button';
  viewButton.textContent = '查看';
  viewButton.onclick = () => viewRecording(recording.id);
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'action-button delete-button';
  deleteButton.textContent = '刪除';
  deleteButton.onclick = () => deleteRecording(recording.id);
  
  actions.appendChild(viewButton);
  actions.appendChild(deleteButton);
  
  info.appendChild(title);
  info.appendChild(time);
  item.appendChild(info);
  item.appendChild(actions);
  
  return item;
}

// 查看錄製
async function viewRecording(recordingId) {
  try {
    // TODO: 實現查看錄製功能
    console.log('查看錄製:', recordingId);
  } catch (error) {
    console.error('查看錄製失敗:', error);
    showError('無法查看錄製');
  }
}

// 刪除錄製
async function deleteRecording(recordingId) {
  try {
    // TODO: 實現刪除錄製功能
    console.log('刪除錄製:', recordingId);
  } catch (error) {
    console.error('刪除錄製失敗:', error);
    showError('無法刪除錄製');
  }
}

// 更新儀表板
async function updateDashboard() {
  try {
    // 更新錄製狀態
    const recordings = await loadRecordings();
    dashboardState.recordings = recordings;
    
    // 重新渲染儀表板
    renderDashboard();
  } catch (error) {
    console.error('更新儀表板失敗:', error);
  }
}

// 顯示錯誤消息
function showError(message) {
  // TODO: 實現錯誤提示UI
  console.error(message);
}

// 當文檔加載完成時初始化儀表板
document.addEventListener('DOMContentLoaded', initializeDashboard); 