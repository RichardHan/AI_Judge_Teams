// 頁面載入後執行的初始化函數
document.addEventListener('DOMContentLoaded', function() {
  const teamSelect = document.getElementById('teamSelect');
  const recentTranscriptsList = document.getElementById('recentTranscriptsList');
  const transcriptDetail = document.getElementById('transcriptDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');
  const backBtn = document.getElementById('backBtn');
  const processNotesBtn = document.getElementById('processNotesBtn');
  const copyToClipboardBtn = document.getElementById('copyToClipboardBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');
  const deleteTranscriptBtn = document.getElementById('deleteTranscriptBtn');
  
  let activeTeams = JSON.parse(localStorage.getItem('teams')) || [];
  let selectedTeamId = '';
  let activeTranscriptId = null;
  
  // 加入調試信息，顯示當前localStorage中的teams數據
  console.log('LocalStorage teams data:', activeTeams);
  console.log('Teams count:', activeTeams.length);
  if(activeTeams.length > 0) {
    activeTeams.forEach((team, index) => {
      console.log(`Team ${index+1}: ${team.name}, ID: ${team.id}`);
      console.log(`  Transcripts count: ${team.transcripts ? team.transcripts.length : 0}`);
    });
  }
  
  // 添加測試按鈕到頁面上（右下角固定位置）
  const debugSection = document.createElement('div');
  debugSection.className = 'debug-section';
  debugSection.innerHTML = `
    <h3>Debug Options</h3>
    <button id="addTestDataBtn" class="btn btn-secondary">Add Test Transcript</button>
    <button id="clearTeamsDataBtn" class="btn btn-danger">Clear All Data</button>
    <div id="debugInfo"></div>
  `;
  debugSection.style.display = 'none'; // Initially hidden
  document.body.appendChild(debugSection);
  
  // 添加可見的Debug按鈕
  const debugButton = document.createElement('button');
  debugButton.className = 'debug-toggle-btn';
  debugButton.innerHTML = '🔧 Debug';
  debugButton.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 8px 16px;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    z-index: 1001;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.3s ease;
  `;
  debugButton.addEventListener('mouseenter', function() {
    this.style.backgroundColor = '#5a6268';
    this.style.transform = 'scale(1.05)';
  });
  debugButton.addEventListener('mouseleave', function() {
    this.style.backgroundColor = '#6c757d';
    this.style.transform = 'scale(1)';
  });
  document.body.appendChild(debugButton);
  
  // Toggle debug section visibility
  let debugVisible = false;
  debugButton.addEventListener('click', function() {
    debugVisible = !debugVisible;
    if (debugVisible) {
      debugSection.style.display = 'block';
      debugSection.style.opacity = '1';
      debugSection.style.visibility = 'visible';
      debugSection.style.transform = 'translateX(0)';
      debugButton.innerHTML = '✖ Close';
      debugButton.style.backgroundColor = '#dc3545';
    } else {
      debugSection.style.display = 'none';
      debugButton.innerHTML = '🔧 Debug';
      debugButton.style.backgroundColor = '#6c757d';
    }
  });
  
  // 添加測試數據按鈕事件
  document.getElementById('addTestDataBtn').addEventListener('click', function() {
    addTestTranscriptData();
  });
  
  // 清除數據按鈕事件
  document.getElementById('clearTeamsDataBtn').addEventListener('click', function() {
    if (confirm('確定要清除所有團隊和轉錄數據嗎？此操作不可撤銷。')) {
      localStorage.removeItem('teams');
      activeTeams = [];
      document.getElementById('debugInfo').textContent = '已清除所有數據。';
      loadTeamSelector();
      loadRecentTranscripts();
      clearTranscriptDetail();
    }
  });
  
  // 創建測試轉錄數據的函數
  function addTestTranscriptData() {
    // 如果沒有團隊，先創建一個
    if (activeTeams.length === 0) {
      activeTeams.push({
        id: Date.now().toString(),
        name: "測試團隊" + Math.floor(Math.random() * 100),
        transcripts: []
      });
    }
    
    // 為第一個團隊添加一個轉錄記錄
    const team = activeTeams[0];
    const baseTime = Date.now();
    
    // 創建更豐富的測試數據，包含音頻轉錄和截圖分析
    const testChunks = [
      {
        timestamp: new Date(baseTime).toISOString(),
        text: "大家好，今天我們要展示的是一個創新的AI解決方案。這個項目主要解決了企業在數據分析方面的痛點。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 5000).toISOString(),
        text: "我們使用了最新的機器學習技術，包括深度學習和自然語言處理。系統可以自動分析客戶反饋並生成洞察報告。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 8000).toISOString(),
        analysis: "Slide showing system architecture with microservices design, API gateway, and distributed database clusters. The presenter is pointing to the machine learning pipeline.",
        type: "screenshot"
      },
      {
        timestamp: new Date(baseTime + 15000).toISOString(),
        text: "在技術架構方面，我們採用了微服務設計，確保系統的可擴展性。每個服務都是獨立部署的，這樣可以提高系統的穩定性。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 20000).toISOString(),
        analysis: "Demo screen showing real-time data analytics dashboard with multiple charts, KPI metrics, and a live feed of customer sentiment analysis results.",
        type: "screenshot"
      },
      {
        timestamp: new Date(baseTime + 25000).toISOString(),
        text: "這是我們的實時分析儀表板。您可以看到，系統能夠即時處理大量數據並提供可視化的洞察。右側是客戶情緒分析的結果。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 30000).toISOString(),
        text: "我們的商業模式是SaaS訂閱制，目前已經有50家企業客戶在使用我們的系統。月收入已經達到10萬美元。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 35000).toISOString(),
        analysis: "Financial projections slide showing hockey stick growth curve, with revenue projections reaching $5M ARR by end of next year. Break-even point highlighted at month 18.",
        type: "screenshot"
      },
      {
        timestamp: new Date(baseTime + 40000).toISOString(),
        text: "根據我們的財務預測，預計明年底可以達到500萬美元的年度經常性收入。我們計劃在18個月內實現盈虧平衡。",
        type: "audio"
      },
      {
        timestamp: new Date(baseTime + 45000).toISOString(),
        text: "謝謝大家的聆聽。現在開放提問時間，歡迎各位評審提出任何問題。",
        type: "audio"
      }
    ];
    
    // 生成完整文本
    const fullText = testChunks
      .map(chunk => {
        if (chunk.type === 'screenshot') {
          return `[Screenshot: ${chunk.analysis}]`;
        }
        return chunk.text;
      })
      .join(' ');
    
    const newTranscript = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      text: fullText,
      chunks: testChunks
    };
    
    team.transcripts.push(newTranscript);
    
    // 保存更新後的團隊數據
    localStorage.setItem('teams', JSON.stringify(activeTeams));
    
    document.getElementById('debugInfo').textContent = `已添加測試轉錄到團隊: ${team.name}`;
    
    // 重新載入列表
    loadTeamSelector();
    loadRecentTranscripts();
  }
  
  // 返回按鈕事件
  backBtn.addEventListener('click', function() {
    window.location.href = 'popup.html';
  });
  
  // Process Notes 按鈕事件
  processNotesBtn.addEventListener('click', async function() {
    if (!selectedTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    // 顯示載入狀態
    processNotesBtn.disabled = true;
    processNotesBtn.textContent = '🔄 Processing...';
    
    try {
      await processNotesWithUserPrompt(transcript);
    } catch (error) {
      console.error('Notes processing failed:', error);
      alert('Notes processing failed: ' + error.message);
    } finally {
      processNotesBtn.disabled = false;
      processNotesBtn.textContent = '🤖 Run AI Analysis';
    }
  });
  
  // 載入團隊選擇器
  function loadTeamSelector() {
    teamSelect.innerHTML = '<option value="">All Teams</option>';
    
    activeTeams.forEach(team => {
      const option = document.createElement('option');
      option.value = team.id;
      option.textContent = team.name;
      teamSelect.appendChild(option);
    });
    
    // 設置事件監聽器
    teamSelect.addEventListener('change', function() {
      selectedTeamId = this.value;
      loadRecentTranscripts();
      clearTranscriptDetail();
    });
  }
  
  // 載入最近轉錄列表
  function loadRecentTranscripts() {
    recentTranscriptsList.innerHTML = '';
    
    let allTranscripts = [];
    
    // 收集所有轉錄記錄
    activeTeams.forEach(team => {
      if (team.transcripts && team.transcripts.length > 0) {
        team.transcripts.forEach(transcript => {
          allTranscripts.push({
            ...transcript,
            teamName: team.name,
            teamId: team.id
          });
        });
      }
    });
    
    // 如果選擇了特定團隊，只顯示該團隊的轉錄
    if (selectedTeamId) {
      allTranscripts = allTranscripts.filter(t => t.teamId === selectedTeamId);
    }
    
    if (allTranscripts.length === 0) {
      recentTranscriptsList.innerHTML = '<div class="empty-state">No meeting records yet</div>';
      return;
    }
    
    // 按日期排序，最新的在前面，只取前3個
    const recentTranscripts = allTranscripts
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3);
    
    recentTranscripts.forEach(transcript => {
      const recentItem = document.createElement('div');
      recentItem.className = 'recent-item';
      if (transcript.id === activeTranscriptId) {
        recentItem.classList.add('active');
      }
      
      const date = new Date(transcript.date);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      recentItem.innerHTML = `
        <div class="recent-date">${formattedDate}</div>
        <div class="recent-team">${transcript.teamName}</div>
        <div class="recent-preview">${truncateText(transcript.text, 120)}</div>
      `;
      
      recentItem.dataset.transcriptId = transcript.id;
      recentItem.dataset.teamId = transcript.teamId;
      
      recentItem.addEventListener('click', function() {
        document.querySelectorAll('.recent-item').forEach(item => {
          item.classList.remove('active');
        });
        
        this.classList.add('active');
        activeTranscriptId = this.dataset.transcriptId;
        
        displayTranscriptDetail(this.dataset.teamId, activeTranscriptId);
      });
      
      recentTranscriptsList.appendChild(recentItem);
    });
  }
  
  // 顯示轉錄詳情
  function displayTranscriptDetail(teamId, transcriptId) {
    // 設置選中的團隊ID，這樣按鈕功能才能正常工作
    selectedTeamId = teamId;
    activeTranscriptId = transcriptId;
    
    const team = activeTeams.find(t => t.id === teamId);
    if (!team) {
      clearTranscriptDetail();
      return;
    }
    
    const transcript = team.transcripts.find(t => t.id === transcriptId);
    if (!transcript) {
      clearTranscriptDetail();
      return;
    }
    
    const date = new Date(transcript.date);
    const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    detailTitle.textContent = `${team.name} - ${formattedDate}`;
    detailContent.innerHTML = '';
    
    if (transcript.chunks && transcript.chunks.length > 0) {
      // 顯示分段轉錄
      transcript.chunks.forEach(chunk => {
        const chunkElement = document.createElement('div');
        
        // Apply 'chunk-item' to all, removing specific 'screenshot-chunk' styling differentiation
        chunkElement.className = 'chunk-item'; 
        
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
    
    // 啟用按鈕
    processNotesBtn.disabled = false;
    copyToClipboardBtn.disabled = false;
    exportTxtBtn.disabled = false;
    deleteTranscriptBtn.disabled = false;
  }
  
  // 清空轉錄詳情
  function clearTranscriptDetail() {
    detailTitle.textContent = 'Transcript Details';
    detailContent.innerHTML = '<div class="empty-state">Please select a meeting record</div>';
    
    // 禁用所有按鈕
    processNotesBtn.disabled = true;
    copyToClipboardBtn.disabled = true;
    exportTxtBtn.disabled = true;
    deleteTranscriptBtn.disabled = true;
  }
  
  // 複製到剪貼簿按鈕點擊事件
  copyToClipboardBtn.addEventListener('click', async function() {
    // Double-check button should be enabled
    if (this.disabled) return;
    if (!selectedTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    try {
      // 顯示載入狀態
      copyToClipboardBtn.disabled = true;
      copyToClipboardBtn.textContent = '📋 Processing...';
      
      const date = new Date(transcript.date);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      
      let transcriptContent = '';
      
      // 建構轉錄內容
      transcriptContent += `${team.name} - ${formattedDate}\n\n`;
      
      if (transcript.chunks && transcript.chunks.length > 0) {
        // 添加分段轉錄內容
        transcript.chunks.forEach(chunk => {
          const date = new Date(chunk.timestamp);
          const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
          
          if (chunk.type === 'screenshot') {
            transcriptContent += `[${formattedTime}] [Screenshot Analysis] ${chunk.analysis}\n\n`;
          } else {
            transcriptContent += `[${formattedTime}] ${chunk.text || chunk.analysis}\n\n`;
          }
        });
      } else {
        // 添加完整轉錄內容
        transcriptContent += transcript.text;
      }
      
      // 獲取用戶自定義的 prompt template
      const userPromptTemplate = localStorage.getItem('user_prompt_template');
      let content = '';
      
      if (userPromptTemplate && userPromptTemplate.trim()) {
        // 如果有 prompt template，將轉錄內容替換到 {context} 中
        content = userPromptTemplate.replace(/{context}/g, transcriptContent);
      } else {
        // 如果沒有 prompt template，只複製轉錄內容
        content = transcriptContent;
      }
      
      // 1. 下載文件
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Prompt_Transcript_${team.name}_${formattedDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      // 2. 複製到剪貼簿
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        
        // 顯示成功狀態
        copyToClipboardBtn.textContent = '✅ Downloaded & Copied!';
        setTimeout(() => {
          copyToClipboardBtn.textContent = '📋 Export Prompt + Transcript';
          copyToClipboardBtn.disabled = false;
        }, 2000);
        
        // 顯示成功提示
        showMessage('File downloaded and copied to clipboard successfully!', 'success');
        
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            copyToClipboardBtn.textContent = '✅ Downloaded & Copied!';
            setTimeout(() => {
              copyToClipboardBtn.textContent = '📋 Export Prompt + Transcript';
              copyToClipboardBtn.disabled = false;
            }, 2000);
            showMessage('File downloaded and copied to clipboard successfully!', 'success');
          } else {
            throw new Error('Copy command failed');
          }
        } catch (err) {
          throw new Error('Fallback copy method failed');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      copyToClipboardBtn.textContent = '❌ Copy Failed';
      setTimeout(() => {
        copyToClipboardBtn.textContent = '📋 Copy to Clipboard';
        copyToClipboardBtn.disabled = false;
      }, 2000);
      showMessage('Failed to copy to clipboard: ' + error.message, 'error');
    }
  });
  
  // 匯出按鈕點擊事件
  exportTxtBtn.addEventListener('click', async function() {
    // Double-check button should be enabled
    if (this.disabled) return;
    if (!selectedTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    try {
      // 顯示載入狀態
      exportTxtBtn.disabled = true;
      exportTxtBtn.textContent = '📄 Processing...';
      
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
          
          if (chunk.type === 'screenshot') {
            content += `[${formattedTime}] [Screenshot Analysis] ${chunk.analysis}\n\n`;
          } else {
            content += `[${formattedTime}] ${chunk.text || chunk.analysis}\n\n`;
          }
        });
      } else {
        // 添加完整轉錄內容
        content += transcript.text;
      }
      
      // 1. 創建Blob並下載
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Transcript_${team.name}_${formattedDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      // 2. 複製到剪貼簿
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        
        // 顯示成功狀態
        exportTxtBtn.textContent = '✅ Downloaded & Copied!';
        setTimeout(() => {
          exportTxtBtn.textContent = '📄 Export Transcript Only';
          exportTxtBtn.disabled = false;
        }, 2000);
        
        showMessage('Transcript downloaded and copied to clipboard successfully!', 'success');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            exportTxtBtn.textContent = '✅ Downloaded & Copied!';
            setTimeout(() => {
              exportTxtBtn.textContent = '📄 Export Transcript Only';
              exportTxtBtn.disabled = false;
            }, 2000);
            showMessage('Transcript downloaded and copied to clipboard successfully!', 'success');
          } else {
            throw new Error('Copy command failed');
          }
        } catch (err) {
          exportTxtBtn.textContent = '❌ Copy Failed';
          setTimeout(() => {
            exportTxtBtn.textContent = '📄 Export Transcript Only';
            exportTxtBtn.disabled = false;
          }, 2000);
          showMessage('Downloaded but failed to copy to clipboard', 'error');
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      exportTxtBtn.textContent = '❌ Export Failed';
      setTimeout(() => {
        exportTxtBtn.textContent = '📄 Export Transcript Only';
        exportTxtBtn.disabled = false;
      }, 2000);
    }
  });
  
  // 刪除按鈕點擊事件
  deleteTranscriptBtn.addEventListener('click', function() {
    if (!selectedTeamId || !activeTranscriptId) return;
    
    if (!confirm('Are you sure you want to delete this meeting record? This action cannot be undone.')) {
      return;
    }
    
    const teamIndex = activeTeams.findIndex(t => t.id === selectedTeamId);
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
    
    // 重新載入最近轉錄列表
    loadRecentTranscripts();
    
    // 重設activeTranscriptId
    activeTranscriptId = null;
  });
  
  // 截斷文本函數
  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
  
  // Meeting Notes Processing 功能
  async function processNotesWithUserPrompt(transcript) {
    const apiKey = localStorage.getItem('openai_api_key');
    const apiEndpoint = localStorage.getItem('openai_api_endpoint') || 'https://api.openai.com/v1';
    
    if (!apiKey) {
      throw new Error('OpenAI API Key not configured. Please set it in settings.');
    }
    
    // 獲取用戶自定義的 prompt template
    const userPromptTemplate = localStorage.getItem('user_prompt_template');
    if (!userPromptTemplate || !userPromptTemplate.trim()) {
      throw new Error('No user prompt template configured. Please set it in settings.');
    }
    
    // 準備轉錄文本 (context)
    const transcriptText = transcript.text || transcript.chunks?.map(chunk => {
      if (chunk.type === 'screenshot_analysis') {
        return `[Screenshot Analysis: ${chunk.analysis}]`;
      } else if (chunk.type === 'screenshot') {
        return `[Screenshot Analysis: ${chunk.analysis}]`;
      }
      return chunk.text || chunk.analysis || '';
    }).join('\n') || '';
    
    if (!transcriptText.trim()) {
      throw new Error('No transcript content to process.');
    }
    
    // 替換 {context} 為實際的轉錄內容
    const finalPrompt = userPromptTemplate.replace(/{context}/g, transcriptText);
    
    // Get enabled models
    const enabledModels = [];
    for (let i = 1; i <= 4; i++) {
      const enabled = localStorage.getItem(`enable_model${i}`) === 'true' || (i === 1 && localStorage.getItem(`enable_model${i}`) !== 'false');
      const model = localStorage.getItem(`openai_model${i}`);
      if (enabled && model) {
        enabledModels.push({ id: i, model });
      }
    }
    
    if (enabledModels.length === 0) {
      throw new Error('No models enabled. Please enable at least one model in settings.');
    }
    
    try {
      // Process with all enabled models in parallel
      const promises = enabledModels.map(({ id, model }) => 
        callNotesProcessor(finalPrompt, apiKey, apiEndpoint, model, id)
      );
      
      const results = await Promise.allSettled(promises);
      displayProcessedNotesMultiple(results, enabledModels);
    } catch (error) {
      throw new Error(`Notes processing API call failed: ${error.message}`);
    }
  }
  
  // 調用 Notes Processor
  async function callNotesProcessor(finalPrompt, apiKey, apiEndpoint, model, modelId) {
    console.log(`Starting API call for Model ${modelId}: ${model}`);
    const startTime = Date.now();
    
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      // Increase timeout for larger models and Gemini
      let timeoutDuration;
      const modelLower = model.toLowerCase();
      if (modelLower.includes('70b') || modelLower.includes('large')) {
        timeoutDuration = 90000; // 90 seconds for large models
      } else if (modelLower.includes('gemini')) {
        timeoutDuration = 60000; // 60 seconds for Gemini models
      } else {
        timeoutDuration = 45000; // 45 seconds for others
      }
      console.log(`Setting timeout for ${model}: ${timeoutDuration/1000} seconds`);
      const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
      
      // Check if this is a Gemini model and adjust endpoint if needed
      const isGeminiModel = model.toLowerCase().includes('gemini');
      let apiUrl = `${apiEndpoint}/chat/completions`;
      
      // Log the request details for debugging
      console.log(`API Request Details:
        - URL: ${apiUrl}
        - Model: ${model}
        - Is Gemini: ${isGeminiModel}
        - Prompt length: ${finalPrompt.length} characters`);
      
      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      };
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      console.log(`Model ${model} responded in ${responseTime}ms with status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error(`Model ${model} error:`, errorData);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log(`Model ${model} response data:`, JSON.stringify(data).substring(0, 200) + '...');
      
      // Handle different response formats
      let messageContent;
      
      // Standard OpenAI format
      if (data.choices && data.choices[0] && data.choices[0].message) {
        messageContent = data.choices[0].message.content;
      }
      // Alternative format (some APIs use this)
      else if (data.choices && data.choices[0] && data.choices[0].text) {
        messageContent = data.choices[0].text;
      }
      // Gemini might use a different format
      else if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        messageContent = data.candidates[0].content.parts ? 
          data.candidates[0].content.parts.map(p => p.text).join('') : 
          data.candidates[0].content;
      }
      // Direct content field
      else if (data.content) {
        messageContent = data.content;
      }
      // Response field
      else if (data.response) {
        messageContent = data.response;
      }
      else {
        console.error(`Model ${model} returned unrecognized response structure:`, data);
        throw new Error('Unrecognized response structure from API');
      }
      
      console.log(`Model ${model} successfully processed. Content length: ${messageContent?.length || 0}`);
      
      // Check for empty content
      if (!messageContent || messageContent.trim().length === 0) {
        console.error(`Model ${model} returned empty content`);
        throw new Error('Model returned empty response');
      }
      
      return {
        modelId,
        model,
        content: messageContent
      };
    } catch (error) {
      const errorTime = Date.now() - startTime;
      console.error(`Model ${model} failed after ${errorTime}ms:`, error);
      
      if (error.name === 'AbortError') {
        const timeoutSeconds = timeoutDuration / 1000;
        throw new Error(`Model ${model}: Request timeout after ${timeoutSeconds} seconds`);
      }
      throw new Error(`Model ${model}: ${error.message}`);
    }
  }

  // 生成 LLM 分數摘要
  function generateScoreSummary(results, enabledModels) {
    const scoreData = [];
    const allScores = [];
    
    // 從每個模型的結果中提取分數
    results.forEach((result, index) => {
      const modelInfo = enabledModels[index];
      if (result.status === 'fulfilled') {
        const content = result.value.content;
        const scores = extractScoresFromContent(content);
        
        // 尋找總分
        let totalScore = null;
        if (scores) {
          // 查找各種可能的總分鍵 - 優先查找 'Total Score'
          const totalKeys = ['Total Score', 'Total', '總分', 'Overall', '總體評分', '總評分'];
          for (const key of totalKeys) {
            if (scores[key]) {
              // 提取數值部分
              const scoreStr = scores[key].toString();
              const match = scoreStr.match(/(\d+(?:\.\d+)?)/);
              if (match) {
                totalScore = parseFloat(match[1]);
                break;
              }
            }
          }
        }
        
        scoreData.push({
          modelId: modelInfo.id,
          model: modelInfo.model,
          totalScore: totalScore
        });
        
        if (totalScore !== null) {
          allScores.push(totalScore);
        }
      } else {
        scoreData.push({
          modelId: modelInfo.id,
          model: modelInfo.model,
          totalScore: null
        });
      }
    });
    
    if (scoreData.length === 0) {
      return '';
    }
    
    // 計算平均分 - N/A scores count as 0
    let totalScore = 0;
    let scoreCount = scoreData.length; // Count all models, including N/A
    
    scoreData.forEach(data => {
      if (data.totalScore !== null) {
        totalScore += data.totalScore;
      }
      // N/A scores contribute 0 to the total
    });
    
    const avgScore = scoreCount > 0 
      ? (totalScore / scoreCount).toFixed(2)
      : 'N/A';
    
    // 構建分數摘要 HTML - 使用 Tab 分隔格式
    let summaryHtml = `
      <div class="score-summary-section">
        <hr style="margin: 20px 0; border: 1px solid #e0e0e0;">
        <h2>📊 LLM Score Summary</h2>
        <div class="score-summary-table-container">
          <table class="llm-score-summary-table">
            <thead>
              <tr>
    `;
    
    // 添加表頭 - LLM1, LLM2, etc.
    scoreData.forEach(data => {
      summaryHtml += `<th>LLM${data.modelId}</th>`;
    });
    summaryHtml += `<th>Avg_from_all_LLM</th></tr>`;
    
    // 添加模型名稱行
    summaryHtml += `<tr class="model-names">`;
    scoreData.forEach(data => {
      summaryHtml += `<td class="model-name">${data.model}</td>`;
    });
    summaryHtml += `<td class="model-name">Average</td></tr>`;
    
    summaryHtml += `</thead><tbody><tr>`;
    
    // 添加分數行
    scoreData.forEach(data => {
      const displayScore = data.totalScore !== null ? data.totalScore : 'N/A';
      summaryHtml += `<td class="score-cell">${displayScore}</td>`;
    });
    summaryHtml += `<td class="score-cell avg-score">${avgScore}</td>`;
    
    summaryHtml += `
            </tr>
          </tbody>
        </table>
        <div class="score-summary-note">
          <p>Note: Scores are extracted from LLM responses. "N/A" indicates no score was found or model failed.</p>
        </div>
      </div>
    </div>
    `;
    
    return summaryHtml;
  }
  
  // 從內容中提取分數
  function extractScoresFromContent(content) {
    const scores = {};
    
    // 首先嘗試直接匹配 "Total Score: X/Y" 或類似格式
    const totalScorePatterns = [
      /Total\s+Score\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i,
      /總分\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i,
      /Overall\s+Score\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i,
      /總體評分\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i,
      /\*\*Total\s+Score\s*[:：]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\*\*/i
    ];
    
    for (const pattern of totalScorePatterns) {
      const match = content.match(pattern);
      if (match) {
        scores['Total Score'] = `${match[1]}/${match[2]}`;
        break;
      }
    }
    
    // 定義可能的分數模式
    const scorePatterns = [
      // 英文模式
      /(?:Score|Rating|Grade|Points?)[\s:：]+(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/gi,
      /(\w+(?:\s+\w+)*?)[\s:：]+(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?(?:\s*(?:points?|分))?/gi,
      // 中文模式
      /(?:評分|分數|得分|成績)[\s:：]+(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/gi,
      /([\u4e00-\u9fa5]+)[\s:：]+(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?(?:\s*分)?/gi,
      // 表格或列表格式
      /[-•*]\s*(\w+(?:\s+\w+)*?)[\s:：]+(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+))?/gi,
      // JSON 格式
      /"(\w+)":\s*(\d+(?:\.\d+)?)/gi
    ];
    
    // 常見的評分項目關鍵詞
    const scoringCriteria = [
      // 英文
      'Innovation', 'Technical', 'Presentation', 'Business Model', 'Market Potential',
      'Team', 'Execution', 'Impact', 'Scalability', 'Feasibility', 'Overall', 'Total',
      // 中文
      '創新性', '技術', '展示', '商業模式', '市場潛力', '團隊', '執行力', '影響力',
      '可擴展性', '可行性', '總分', '總體評分'
    ];
    
    // 嘗試使用不同的模式提取分數
    scorePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const criteria = match[1];
        const score = match[2];
        const maxScore = match[3];
        
        // 檢查是否為有效的評分項目
        const isValidCriteria = scoringCriteria.some(keyword => 
          criteria.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (isValidCriteria || (score && parseFloat(score) <= 100)) {
          const formattedScore = maxScore ? `${score}/${maxScore}` : score;
          // 避免覆蓋已經找到的 Total Score
          if (!(criteria.toLowerCase().includes('total') && scores['Total Score'])) {
            scores[criteria] = formattedScore;
          }
        }
      }
    });
    
    // 如果沒有找到分數，嘗試更寬鬆的匹配
    if (Object.keys(scores).length === 0) {
      // 查找任何數字後跟"分"或"points"的模式
      const simplePattern = /(\d+(?:\.\d+)?)\s*(?:分|points?|\/\s*\d+)/gi;
      const lines = content.split('\n');
      
      lines.forEach(line => {
        scoringCriteria.forEach(criteria => {
          if (line.includes(criteria)) {
            const match = simplePattern.exec(line);
            if (match) {
              scores[criteria] = match[1];
            }
          }
        });
      });
    }
    
    return scores;
  }
  
  // 顯示處理後的筆記結果（多模型）
  function displayProcessedNotesMultiple(results, enabledModels) {
    // 保存原始的轉錄內容
    const originalContent = detailContent.innerHTML;
    
    // 構建多模型結果的 HTML
    let resultsHtml = '';
    results.forEach((result, index) => {
      const modelInfo = enabledModels[index];
      if (result.status === 'fulfilled') {
        resultsHtml += `
          <div class="model-result">
            <h3>Model ${modelInfo.id}: ${modelInfo.model}</h3>
            <div class="model-result-content">
              ${result.value.content.replace(/\n/g, '<br>')}
            </div>
          </div>
        `;
      } else {
        console.error(`Model ${modelInfo.id} (${modelInfo.model}) failed:`, result.reason);
        resultsHtml += `
          <div class="model-result model-error">
            <h3>Model ${modelInfo.id}: ${modelInfo.model}</h3>
            <div class="model-result-error">
              <strong>Error:</strong> ${result.reason.message}
              <br><small>Check browser console for detailed error information</small>
            </div>
          </div>
        `;
      }
    });
    
    // 生成 LLM 分數摘要
    const scoreSummaryHtml = generateScoreSummary(results, enabledModels);
    
    // 在詳情內容前面插入處理後的筆記
    detailContent.innerHTML = `
      <div class="processed-notes-results">
        <div class="notes-header">
          <h2>📝 Processed Meeting Notes</h2>
          <button id="exportNotesBtn" class="btn btn-action btn-sm">📁 Export AI Analysis</button>
        </div>
        <div class="processed-notes-container">
          ${resultsHtml}
        </div>
        <hr style="margin: 20px 0; border: 1px solid #e0e0e0;">
        <h2>Original Transcript Preview</h2>
      </div>
    ` + originalContent + scoreSummaryHtml;
    
    // 為新的export按鈕添加事件監聽器
    const exportNotesBtn = document.getElementById('exportNotesBtn');
    if (exportNotesBtn) {
      exportNotesBtn.addEventListener('click', function() {
        exportProcessedNotesMultiple(results, enabledModels);
      });
    }
  }
  
  // 匯出處理後的筆記結果（多模型）
  async function exportProcessedNotesMultiple(results, enabledModels) {
    if (!selectedTeamId || !activeTranscriptId || !results || results.length === 0) {
      alert('No processed notes to export.');
      return;
    }
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    const exportBtn = document.getElementById('exportNotesBtn');
    
    try {
      // 顯示載入狀態
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = '📁 Processing...';
      }
      
      const date = new Date(transcript.date);
      const formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
      const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      
      let content = '';
      
      // 添加標題
      content += `Meeting Notes Summary\n`;
      content += `Team: ${team.name}\n`;
      content += `Date: ${formattedDate} ${formattedTime}\n`;
      content += `Generated: ${new Date().toLocaleString()}\n`;
      content += `${'='.repeat(60)}\n\n`;
    
    // 添加處理後的筆記內容（多模型）
    results.forEach((result, index) => {
      const modelInfo = enabledModels[index];
      content += `\n[Model ${modelInfo.id}: ${modelInfo.model}]\n`;
      content += `${'-'.repeat(40)}\n`;
      
      if (result.status === 'fulfilled') {
        content += result.value.content;
      } else {
        content += `Error: ${result.reason.message}`;
      }
      
      content += `\n\n`;
    });
    
    content += `${'='.repeat(60)}\n`;
    
    // 添加分數摘要 - 使用 Tab 分隔格式
    const scoreDataForExport = [];
    const allScoresForExport = [];
    
    results.forEach((result, index) => {
      const modelInfo = enabledModels[index];
      if (result.status === 'fulfilled') {
        const scores = extractScoresFromContent(result.value.content);
        
        // 尋找總分
        let totalScore = null;
        if (scores) {
          // 查找各種可能的總分鍵 - 優先查找 'Total Score'
          const totalKeys = ['Total Score', 'Total', '總分', 'Overall', '總體評分', '總評分'];
          for (const key of totalKeys) {
            if (scores[key]) {
              const scoreStr = scores[key].toString();
              const match = scoreStr.match(/(\d+(?:\.\d+)?)/);
              if (match) {
                totalScore = parseFloat(match[1]);
                break;
              }
            }
          }
        }
        
        scoreDataForExport.push({
          modelId: modelInfo.id,
          model: modelInfo.model,
          totalScore: totalScore
        });
        
        if (totalScore !== null) {
          allScoresForExport.push(totalScore);
        }
      } else {
        scoreDataForExport.push({
          modelId: modelInfo.id,
          model: modelInfo.model,
          totalScore: null
        });
      }
    });
    
    if (scoreDataForExport.length > 0) {
      // 計算平均分 - N/A scores count as 0
      let totalScoreForExport = 0;
      let scoreCountForExport = scoreDataForExport.length; // Count all models, including N/A
      
      scoreDataForExport.forEach(data => {
        if (data.totalScore !== null) {
          totalScoreForExport += data.totalScore;
        }
        // N/A scores contribute 0 to the total
      });
      
      const avgScore = scoreCountForExport > 0 
        ? (totalScoreForExport / scoreCountForExport).toFixed(2)
        : 'N/A';
      
      content += `\nLLM Score Summary:\n`;
      content += `${'-'.repeat(60)}\n`;
      
      // 建立表頭行
      let headerRow = '';
      let modelRow = '';
      let scoreRow = '';
      
      scoreDataForExport.forEach(data => {
        headerRow += `LLM${data.modelId}\t`;
        modelRow += `${data.model}\t`;
        scoreRow += `${data.totalScore !== null ? data.totalScore : 'N/A'}\t`;
      });
      
      headerRow += 'Avg_from_all_LLM';
      modelRow += 'Average';
      scoreRow += avgScore;
      
      content += headerRow + '\n';
      content += modelRow + '\n';
      content += scoreRow + '\n';
      
      content += `${'='.repeat(60)}\n`;
    }
    
    // 添加原始轉錄摘要（可選）
    const transcriptText = transcript.text || transcript.chunks?.map(chunk => {
      if (chunk.type === 'screenshot') {
        return `[Screenshot Analysis: ${chunk.analysis}]`;
      }
      return chunk.text || chunk.analysis || '';
    }).join('\n') || '';
    const transcriptPreview = transcriptText.length > 500 ? 
      transcriptText.substring(0, 500) + '...\n[Full transcript available in original meeting record]' : transcriptText;
    
    content += `\nOriginal Transcript Preview:\n`;
    content += `${'-'.repeat(28)}\n`;
    content += `${transcriptPreview}`;
    
      // 1. 創建Blob並下載
      const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI_Analysis_${team.name}_${formattedDate}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      
      // 2. 複製到剪貼簿
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        
        // 顯示成功狀態
        if (exportBtn) {
          exportBtn.textContent = '✅ Downloaded & Copied!';
          setTimeout(() => {
            exportBtn.textContent = '📁 Export AI Analysis';
            exportBtn.disabled = false;
          }, 2000);
        }
        
        showMessage('AI analysis downloaded and copied to clipboard successfully!', 'success');
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            if (exportBtn) {
              exportBtn.textContent = '✅ Downloaded & Copied!';
              setTimeout(() => {
                exportBtn.textContent = '📁 Export AI Analysis';
                exportBtn.disabled = false;
              }, 2000);
            }
            showMessage('AI analysis downloaded and copied to clipboard successfully!', 'success');
          } else {
            throw new Error('Copy command failed');
          }
        } catch (err) {
          if (exportBtn) {
            exportBtn.textContent = '❌ Copy Failed';
            setTimeout(() => {
              exportBtn.textContent = '📁 Export AI Analysis';
              exportBtn.disabled = false;
            }, 2000);
          }
          showMessage('Downloaded but failed to copy to clipboard', 'error');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      
      console.log('Processed notes exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      if (exportBtn) {
        exportBtn.textContent = '❌ Export Failed';
        setTimeout(() => {
          exportBtn.textContent = '📁 Export AI Analysis';
          exportBtn.disabled = false;
        }, 2000);
      }
      showMessage('Failed to export AI analysis', 'error');
    }
  }
  
  // 顯示提示消息的函數
  function showMessage(message, type = 'success') {
    // 創建或獲取消息容器
    let messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'messageContainer';
      messageContainer.style.position = 'fixed';
      messageContainer.style.top = '20px';
      messageContainer.style.right = '20px';
      messageContainer.style.zIndex = '9999';
      messageContainer.style.maxWidth = '300px';
      document.body.appendChild(messageContainer);
    }
    
    // 創建消息元素
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.style.padding = '12px 16px';
    messageElement.style.marginBottom = '10px';
    messageElement.style.borderRadius = '6px';
    messageElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    messageElement.style.fontSize = '14px';
    messageElement.style.fontWeight = '500';
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateX(100%)';
    messageElement.style.transition = 'all 0.3s ease-in-out';
    
    if (type === 'success') {
      messageElement.style.backgroundColor = '#d4edda';
      messageElement.style.color = '#155724';
      messageElement.style.border = '1px solid #c3e6cb';
    } else if (type === 'error') {
      messageElement.style.backgroundColor = '#f8d7da';
      messageElement.style.color = '#721c24';
      messageElement.style.border = '1px solid #f5c6cb';
    }
    
    messageElement.textContent = message;
    messageContainer.appendChild(messageElement);
    
    // 顯示動畫
    setTimeout(() => {
      messageElement.style.opacity = '1';
      messageElement.style.transform = 'translateX(0)';
    }, 100);
    
    // 自動隱藏
    setTimeout(() => {
      messageElement.style.opacity = '0';
      messageElement.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (messageContainer.contains(messageElement)) {
          messageContainer.removeChild(messageElement);
        }
      }, 300);
    }, 3000);
  }
  
  // 初始化頁面
  loadTeamSelector();
  loadRecentTranscripts();
  clearTranscriptDetail();
  
  // Extra safety: ensure buttons are disabled on load
  copyToClipboardBtn.disabled = true;
  exportTxtBtn.disabled = true;
  processNotesBtn.disabled = true;
  deleteTranscriptBtn.disabled = true;
}); 