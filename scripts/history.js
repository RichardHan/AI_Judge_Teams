// 頁面載入後執行的初始化函數
document.addEventListener('DOMContentLoaded', function() {
  const teamsList = document.getElementById('teamsList');
  const transcriptsList = document.getElementById('transcriptsList');
  const transcriptDetail = document.getElementById('transcriptDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');
  const backBtn = document.getElementById('backBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const deleteTranscriptBtn = document.getElementById('deleteTranscriptBtn');
  
  let activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
  let activeTeamId = null;
  let activeTranscriptId = null;
  
  // 返回按鈕事件
  backBtn.addEventListener('click', function() {
    window.location.href = 'popup.html';
  });
  
  // 載入團隊列表
  function loadTeamsList() {
    teamsList.innerHTML = '';
    
    if (activeTeams.length === 0) {
      teamsList.innerHTML = '<div class="empty-state">No teams yet</div>';
      return;
    }
    
    activeTeams.forEach(team => {
      const teamItem = document.createElement('div');
      teamItem.className = 'team-item';
      if (team.id === activeTeamId) {
        teamItem.classList.add('active');
      }
      
      teamItem.textContent = team.name;
      teamItem.dataset.teamId = team.id;
      
      teamItem.addEventListener('click', function() {
        document.querySelectorAll('.team-item').forEach(item => {
          item.classList.remove('active');
        });
        
        this.classList.add('active');
        activeTeamId = this.dataset.teamId;
        activeTranscriptId = null;
        
        loadTranscriptsList(activeTeamId);
        clearTranscriptDetail();
      });
      
      teamsList.appendChild(teamItem);
    });
    
    // 如果沒有選中的團隊，自動選擇第一個
    if (!activeTeamId && activeTeams.length > 0) {
      activeTeamId = activeTeams[0].id;
      teamsList.querySelector('.team-item').classList.add('active');
      loadTranscriptsList(activeTeamId);
    }
  }
  
  // 載入轉錄列表
  function loadTranscriptsList(teamId) {
    transcriptsList.innerHTML = '';
    
    const team = activeTeams.find(t => t.id === teamId);
    if (!team || !team.transcripts || team.transcripts.length === 0) {
      transcriptsList.innerHTML = '<div class="empty-state">No meeting records yet</div>';
      return;
    }
    
    // 按日期排序，最新的在前面
    const sortedTranscripts = [...team.transcripts].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    sortedTranscripts.forEach(transcript => {
      const transcriptItem = document.createElement('div');
      transcriptItem.className = 'transcript-item';
      if (transcript.id === activeTranscriptId) {
        transcriptItem.classList.add('active');
      }
      
      const date = new Date(transcript.date);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      transcriptItem.innerHTML = `
        <div class="transcript-date">${formattedDate}</div>
        <div class="transcript-preview">${truncateText(transcript.text, 100)}</div>
      `;
      
      transcriptItem.dataset.transcriptId = transcript.id;
      
      transcriptItem.addEventListener('click', function() {
        document.querySelectorAll('.transcript-item').forEach(item => {
          item.classList.remove('active');
        });
        
        this.classList.add('active');
        activeTranscriptId = this.dataset.transcriptId;
        
        displayTranscriptDetail(teamId, activeTranscriptId);
      });
      
      transcriptsList.appendChild(transcriptItem);
    });
  }
  
  // 顯示轉錄詳情
  function displayTranscriptDetail(teamId, transcriptId) {
    const team = activeTeams.find(t => t.id === teamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === transcriptId);
    if (!transcript) return;
    
    const date = new Date(transcript.date);
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    detailTitle.textContent = `${team.name} - ${formattedDate}`;
    detailContent.innerHTML = '';
    
    if (transcript.chunks && transcript.chunks.length > 0) {
      // 顯示分段轉錄
      transcript.chunks.forEach(chunk => {
        const chunkElement = document.createElement('div');
        chunkElement.className = 'chunk-item';
        
        const date = new Date(chunk.timestamp);
        const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        
        chunkElement.innerHTML = `
          <div class="chunk-header">
            <span class="chunk-time">${formattedTime}</span>
          </div>
          <div class="chunk-text">${chunk.text}</div>
        `;
        
        detailContent.appendChild(chunkElement);
      });
    } else {
      // 顯示完整轉錄
      const textElement = document.createElement('div');
      textElement.className = 'full-text';
      textElement.textContent = transcript.text;
      detailContent.appendChild(textElement);
    }
    
    // 顯示轉錄詳情面板
    transcriptDetail.style.display = 'flex';
    
    // 啟用匯出和刪除按鈕
    exportTxtBtn.disabled = false;
    deleteTranscriptBtn.disabled = false;
  }
  
  // 清空轉錄詳情
  function clearTranscriptDetail() {
    detailTitle.textContent = 'Transcript Details';
    detailContent.innerHTML = '<div class="empty-state">Please select a meeting record</div>';
    
    // 禁用匯出和刪除按鈕
    exportTxtBtn.disabled = true;
    deleteTranscriptBtn.disabled = true;
  }
  
  // 匯出按鈕點擊事件
  exportTxtBtn.addEventListener('click', function() {
    if (!activeTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === activeTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    const date = new Date(transcript.date);
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    
    let content = '';
    
    // 添加標題
    content += `${team.name} - ${formattedDate}\n\n`;
    
    if (transcript.chunks && transcript.chunks.length > 0) {
      // 添加分段轉錄內容
      transcript.chunks.forEach(chunk => {
        const date = new Date(chunk.timestamp);
        const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        
        content += `[${formattedTime}] ${chunk.text}\n\n`;
      });
    } else {
      // 添加完整轉錄內容
      content += transcript.text;
    }
    
    // 創建Blob並下載
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${team.name}_${formattedDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });
  
  // 刪除按鈕點擊事件
  deleteTranscriptBtn.addEventListener('click', function() {
    if (!activeTeamId || !activeTranscriptId) return;
    
    if (!confirm('Are you sure you want to delete this meeting record? This action cannot be undone.')) {
      return;
    }
    
    const teamIndex = activeTeams.findIndex(t => t.id === activeTeamId);
    if (teamIndex === -1) return;
    
    const team = activeTeams[teamIndex];
    
    // 刪除轉錄記錄
    const transcriptIndex = team.transcripts.findIndex(t => t.id === activeTranscriptId);
    if (transcriptIndex === -1) return;
    
    team.transcripts.splice(transcriptIndex, 1);
    
    // 更新LocalStorage
    localStorage.setItem('teams', JSON.stringify(activeTeams));
    
    // 清空轉錄詳情
    clearTranscriptDetail();
    
    // 重新載入轉錄列表
    loadTranscriptsList(activeTeamId);
    
    // 重設activeTranscriptId
    activeTranscriptId = null;
  });
  
  // 截斷文本函數
  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  // 初始化頁面
  loadTeamsList();
  clearTranscriptDetail();
}); 