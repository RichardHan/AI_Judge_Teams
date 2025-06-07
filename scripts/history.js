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
  document.body.appendChild(debugSection);
  
  // 添加觸發區域
  const debugTrigger = document.createElement('div');
  debugTrigger.className = 'debug-trigger';
  document.body.appendChild(debugTrigger);
  
  // 添加滑鼠事件來控制debug section的顯示
  debugTrigger.addEventListener('mouseenter', function() {
    debugSection.classList.add('show');
  });
  
  debugTrigger.addEventListener('mouseleave', function() {
    debugSection.classList.remove('show');
  });
  
  debugSection.addEventListener('mouseenter', function() {
    debugSection.classList.add('show');
  });
  
  debugSection.addEventListener('mouseleave', function() {
    debugSection.classList.remove('show');
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
    const testChunks = [
      {
        timestamp: new Date().toISOString(),
        text: "這是一段測試轉錄文本，用於測試歷史記錄功能是否正常工作。",
        isFinal: false
      },
      {
        timestamp: new Date(Date.now() + 10000).toISOString(),
        text: "這是第二段轉錄文本，生成於十秒後。",
        isFinal: false
      },
      {
        timestamp: new Date(Date.now() + 20000).toISOString(),
        text: "這是最後一段測試文本，作為最終段落。",
        isFinal: true
      }
    ];
    
    const newTranscript = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      text: testChunks.map(chunk => chunk.text).join(' '),
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
      processNotesBtn.textContent = '📝 Process Notes';
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
    if (!selectedTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
    try {
      // 顯示載入狀態
      copyToClipboardBtn.disabled = true;
      copyToClipboardBtn.textContent = '📋 Copying...';
      
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
      
      // 使用 Clipboard API 複製到剪貼簿
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
        
        // 顯示成功狀態
        copyToClipboardBtn.textContent = '✅ Copied!';
        setTimeout(() => {
          copyToClipboardBtn.textContent = '📋 Copy to Clipboard';
          copyToClipboardBtn.disabled = false;
        }, 2000);
        
        // 顯示成功提示
        showMessage('Transcript copied to clipboard successfully!', 'success');
        
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
            copyToClipboardBtn.textContent = '✅ Copied!';
            setTimeout(() => {
              copyToClipboardBtn.textContent = '📋 Copy to Clipboard';
              copyToClipboardBtn.disabled = false;
            }, 2000);
            showMessage('Transcript copied to clipboard successfully!', 'success');
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
  exportTxtBtn.addEventListener('click', function() {
    if (!selectedTeamId || !activeTranscriptId) return;
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
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
    try {
      const response = await fetch(`${apiEndpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: finalPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`${errorData.error?.message || errorData.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      return {
        modelId,
        model,
        content: data.choices[0]?.message?.content || 'No processed notes received'
      };
    } catch (error) {
      throw new Error(`Model ${model}: ${error.message}`);
    }
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
        resultsHtml += `
          <div class="model-result model-error">
            <h3>Model ${modelInfo.id}: ${modelInfo.model}</h3>
            <div class="model-result-error">
              Error: ${result.reason.message}
            </div>
          </div>
        `;
      }
    });
    
    // 在詳情內容前面插入處理後的筆記
    detailContent.innerHTML = `
      <div class="processed-notes-results">
        <div class="notes-header">
          <h2>📝 Processed Meeting Notes</h2>
          <button id="exportNotesBtn" class="btn btn-action btn-sm">📁 Export All Notes</button>
        </div>
        <div class="processed-notes-container">
          ${resultsHtml}
        </div>
        <hr style="margin: 20px 0; border: 1px solid #e0e0e0;">
        <h2>Original Transcript</h2>
      </div>
    ` + originalContent;
    
    // 為新的export按鈕添加事件監聽器
    const exportNotesBtn = document.getElementById('exportNotesBtn');
    if (exportNotesBtn) {
      exportNotesBtn.addEventListener('click', function() {
        exportProcessedNotesMultiple(results, enabledModels);
      });
    }
  }
  
  // 匯出處理後的筆記結果（多模型）
  function exportProcessedNotesMultiple(results, enabledModels) {
    if (!selectedTeamId || !activeTranscriptId || !results || results.length === 0) {
      alert('No processed notes to export.');
      return;
    }
    
    const team = activeTeams.find(t => t.id === selectedTeamId);
    if (!team) return;
    
    const transcript = team.transcripts.find(t => t.id === activeTranscriptId);
    if (!transcript) return;
    
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
    
    // 創建Blob並下載
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meeting_Notes_${team.name}_${formattedDate}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    // 顯示成功訊息
    console.log('Processed notes exported successfully');
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
}); 