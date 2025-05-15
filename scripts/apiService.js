class ApiService {
  constructor() {
    // 從存儲中讀取API密鑰
    this.apiKey = null;
    this._loadApiKey();
  }
  
  // 載入API密鑰
  async _loadApiKey() {
    const data = await chrome.storage.sync.get('openai_api_key');
    this.apiKey = data.openai_api_key || null;
  }
  
  // 設置API密鑰
  async setApiKey(key) {
    this.apiKey = key;
    await chrome.storage.sync.set({ 'openai_api_key': key });
  }
  
  // 檢查API密鑰
  _checkApiKey() {
    if (!this.apiKey) {
      throw new Error('未設置OpenAI API密鑰');
    }
  }
  
  // 轉錄音訊（使用Whisper API）
  async transcribeAudio(audioBlob) {
    this._checkApiKey();
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    
    try {
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Whisper API錯誤: ${error.error?.message || '未知錯誤'}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('音訊轉錄失敗:', error);
      throw error;
    }
  }
  
  // 分析圖像（使用GPT-4o）
  async analyzeImage(imageBlob) {
    this._checkApiKey();
    
    // 轉換Blob為base64
    const base64Image = await this._blobToBase64(imageBlob);
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `你是一位AI Hackathon評委助手。你的任務是分析演示幻燈片截圖，描述其內容，並識別關鍵技術點、創新點、商業模型等核心信息。請簡潔描述圖片內容並提取可能對評分有用的要點。`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`
                  }
                },
                {
                  type: 'text',
                  text: '請分析這張演示幻燈片截圖，提取關鍵信息並評估其技術和商業價值。'
                }
              ]
            }
          ]
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`GPT-4o API錯誤: ${error.error?.message || '未知錯誤'}`);
      }
      
      const result = await response.json();
      return result.choices[0].message.content;
    } catch (error) {
      console.error('圖像分析失敗:', error);
      throw error;
    }
  }
  
  // 進行最終評估
  async evaluatePresentation(presentationData) {
    this._checkApiKey();
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `你是AI Hackathon的專業評審，分析參賽團隊的演示內容並提供評分與反饋。
              
評分標準（1-10分制）:
1. 技術創新性：解決方案的技術創新程度
2. 實用價值：解決實際問題的有效性
3. 實現完整度：原型/演示的完整程度
4. 演示質量：表達清晰度與說服力
5. 商業潛力：市場前景與擴展可能性

你的輸出應包含：
1. 每個評分項目的分數與詳細理由（列舉具體事實支持）
2. 總結評語（200字以內）
3. 3個深度技術問題（基於演示內容，測試團隊技術理解）
4. 1個商業模式問題（測試商業化思考）
5. 最終總分與排名建議

請保持公正客觀，重視演示中展示的實際成果而非純粹概念。`
            },
            {
              role: 'user',
              content: `請評估以下演示內容：
              
團隊名稱：${presentationData.teamName}
項目名稱：${presentationData.projectName}

轉錄內容：
${presentationData.transcriptions.map(t => `[${t.timestamp}] ${t.text}`).join('\n\n')}

截圖分析：
${presentationData.screenshots.map(s => `[${s.timestamp}] ${s.analysis}`).join('\n\n')}

請提供完整評分和提問。`
            }
          ]
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`評估API錯誤: ${error.error?.message || '未知錯誤'}`);
      }
      
      const result = await response.json();
      return result.choices[0].message.content;
    } catch (error) {
      console.error('演示評估失敗:', error);
      throw error;
    }
  }
  
  // 輔助方法：Blob轉Base64
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}