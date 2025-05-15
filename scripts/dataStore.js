class DataStore {
  constructor() {
    this.dbName = 'AIJudgeDB';
    this.dbVersion = 1;
    this.db = null;
    this._initDB();
  }
  
  // 初始化IndexedDB
  async _initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = (event) => {
        console.error('數據庫錯誤:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 音訊段存儲
        if (!db.objectStoreNames.contains('audioSegments')) {
          const audioStore = db.createObjectStore('audioSegments', { keyPath: 'id', autoIncrement: true });
          audioStore.createIndex('timestamp', 'timestamp', { unique: false });
          audioStore.createIndex('teamId', 'teamId', { unique: false });
        }
        
        // 轉錄存儲
        if (!db.objectStoreNames.contains('transcriptions')) {
          const transStore = db.createObjectStore('transcriptions', { keyPath: 'id', autoIncrement: true });
          transStore.createIndex('audioId', 'audioId', { unique: false });
          transStore.createIndex('timestamp', 'timestamp', { unique: false });
          transStore.createIndex('teamId', 'teamId', { unique: false });
        }
        
        // 截圖存儲
        if (!db.objectStoreNames.contains('screenshots')) {
          const screenStore = db.createObjectStore('screenshots', { keyPath: 'id', autoIncrement: true });
          screenStore.createIndex('timestamp', 'timestamp', { unique: false });
          screenStore.createIndex('teamId', 'teamId', { unique: false });
        }
        
        // 圖像分析存儲
        if (!db.objectStoreNames.contains('imageAnalyses')) {
          const analysisStore = db.createObjectStore('imageAnalyses', { keyPath: 'id', autoIncrement: true });
          analysisStore.createIndex('screenshotId', 'screenshotId', { unique: false });
          analysisStore.createIndex('timestamp', 'timestamp', { unique: false });
          analysisStore.createIndex('teamId', 'teamId', { unique: false });
        }
        
        // 團隊信息存儲
        if (!db.objectStoreNames.contains('teams')) {
          const teamStore = db.createObjectStore('teams', { keyPath: 'id', autoIncrement: true });
          teamStore.createIndex('name', 'name', { unique: false });
        }
        
        // 評估結果存儲
        if (!db.objectStoreNames.contains('evaluations')) {
          const evalStore = db.createObjectStore('evaluations', { keyPath: 'id', autoIncrement: true });
          evalStore.createIndex('teamId', 'teamId', { unique: false });
          evalStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  // 確保數據庫已初始化
  async _ensureDB() {
    if (!this.db) {
      await this._initDB();
    }
    return this.db;
  }
  
  // 保存音訊段
  async saveAudioSegment(audioBlob, timestamp, teamId = null) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['audioSegments'], 'readwrite');
      const store = transaction.objectStore('audioSegments');
      
      const item = {
        audioBlob,
        timestamp,
        teamId,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result); // 返回新創建的ID
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 保存轉錄結果
  async saveTranscription(audioId, transcription, timestamp, teamId = null) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['transcriptions'], 'readwrite');
      const store = transaction.objectStore('transcriptions');
      
      const item = {
        audioId,
        text: transcription.text,
        timestamp,
        teamId,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 保存截圖
  async saveScreenshot(imageBlob, timestamp, teamId = null) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['screenshots'], 'readwrite');
      const store = transaction.objectStore('screenshots');
      
      const item = {
        imageBlob,
        timestamp,
        teamId,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 保存圖像分析
  async saveImageAnalysis(screenshotId, analysis, timestamp, teamId = null) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['imageAnalyses'], 'readwrite');
      const store = transaction.objectStore('imageAnalyses');
      
      const item = {
        screenshotId,
        analysis,
        timestamp,
        teamId,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 創建團隊
  async createTeam(teamData) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['teams'], 'readwrite');
      const store = transaction.objectStore('teams');
      
      const item = {
        ...teamData,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 保存評估結果
  async saveEvaluation(evaluationData) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['evaluations'], 'readwrite');
      const store = transaction.objectStore('evaluations');
      
      const item = {
        ...evaluationData,
        createdAt: new Date()
      };
      
      const request = store.add(item);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 獲取團隊的所有轉錄
  async getTeamTranscriptions(teamId) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['transcriptions'], 'readonly');
      const store = transaction.objectStore('transcriptions');
      const index = store.index('teamId');
      
      const request = index.getAll(teamId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 獲取團隊的所有圖像分析
  async getTeamImageAnalyses(teamId) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['imageAnalyses'], 'readonly');
      const store = transaction.objectStore('imageAnalyses');
      const index = store.index('teamId');
      
      const request = index.getAll(teamId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 獲取團隊信息
  async getTeam(teamId) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['teams'], 'readonly');
      const store = transaction.objectStore('teams');
      
      const request = store.get(teamId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 獲取所有團隊
  async getAllTeams() {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['teams'], 'readonly');
      const store = transaction.objectStore('teams');
      
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 獲取團隊評估結果
  async getTeamEvaluation(teamId) {
    await this._ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['evaluations'], 'readonly');
      const store = transaction.objectStore('evaluations');
      const index = store.index('teamId');
      
      const request = index.get(teamId);
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }
  
  // 清除所有數據（慎用）
  async clearAllData() {
    await this._ensureDB();
    
    const storeNames = ['audioSegments', 'transcriptions', 
                      'screenshots', 'imageAnalyses', 
                      'teams', 'evaluations'];
    
    const promises = storeNames.map(storeName => {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    
    return Promise.all(promises);
  }
}