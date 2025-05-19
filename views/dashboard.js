// Dashboard state management
let dashboardState = {
  teams: [],
  recordings: new Map(), // teamId -> recordings[]
  activeRecordings: new Set()
};

// Initialize dashboard
async function initializeDashboard() {
  try {
    // Load team data from storage
    const teams = await loadTeams();
    dashboardState.teams = teams;
    
    // Load recording data from storage
    const recordings = await loadRecordings();
    dashboardState.recordings = recordings;
    
    // Render dashboard
    renderDashboard();
    
    // Set up periodic updates
    setInterval(updateDashboard, 5000);
  } catch (error) {
    console.error('Dashboard initialization failed:', error);
    showError('Failed to load dashboard, please refresh the page and try again');
  }
}

// Load team data
async function loadTeams() {
  // TODO: Implement loading team data from storage
  return [];
}

// Load recording data
async function loadRecordings() {
  // TODO: Implement loading recording data from storage
  return new Map();
}

// Render dashboard
function renderDashboard() {
  const container = document.querySelector('.dashboard-container');
  if (!container) return;

  // Render team cards
  const teamGrid = document.createElement('div');
  teamGrid.className = 'team-grid';
  
  dashboardState.teams.forEach(team => {
    const teamCard = createTeamCard(team);
    teamGrid.appendChild(teamCard);
  });
  
  container.appendChild(teamGrid);
}

// Create team card
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

// Create recording item
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
  viewButton.textContent = 'View';
  viewButton.onclick = () => viewRecording(recording.id);
  
  const deleteButton = document.createElement('button');
  deleteButton.className = 'action-button delete-button';
  deleteButton.textContent = 'Delete';
  deleteButton.onclick = () => deleteRecording(recording.id);
  
  actions.appendChild(viewButton);
  actions.appendChild(deleteButton);
  
  info.appendChild(title);
  info.appendChild(time);
  item.appendChild(info);
  item.appendChild(actions);
  
  return item;
}

// View recording
async function viewRecording(recordingId) {
  try {
    // TODO: Implement view recording functionality
    console.log('Viewing recording:', recordingId);
  } catch (error) {
    console.error('Failed to view recording:', error);
    showError('Unable to view recording');
  }
}

// Delete recording
async function deleteRecording(recordingId) {
  try {
    // TODO: Implement delete recording functionality
    console.log('Deleting recording:', recordingId);
  } catch (error) {
    console.error('Failed to delete recording:', error);
    showError('Unable to delete recording');
  }
}

// Update dashboard
async function updateDashboard() {
  try {
    // Update recording status
    const recordings = await loadRecordings();
    dashboardState.recordings = recordings;
    
    // Re-render dashboard
    renderDashboard();
  } catch (error) {
    console.error('Failed to update dashboard:', error);
  }
}

// Show error message
function showError(message) {
  // TODO: Implement error notification UI
  console.error(message);
}

// Initialize dashboard when document is loaded
document.addEventListener('DOMContentLoaded', initializeDashboard); 