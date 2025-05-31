class ScreenshotManager {
  constructor() {
    this.apiService = new APIService();
    this.dataStore = new DataStore();
  }
  
  // 處理截圖
  async processScreenshot(imageBlob, timestamp, teamId = null) {
    try {
      // 先存儲原始截圖
      const screenshotId = await this.dataStore.saveScreenshot(imageBlob, timestamp, teamId);
      
      // 獲取截圖分析詳細程度設置
      const detailLevel = await this.getScreenshotDetailLevel();
      
      // 發送到GPT-4o進行分析
      const imageAnalysis = await this.apiService.analyzeImage(imageBlob, detailLevel);
      
      // 存儲分析結果
      await this.dataStore.saveImageAnalysis(screenshotId, imageAnalysis, timestamp, teamId);
      
      // 通知UI更新
      chrome.runtime.sendMessage({
        action: 'screenshotAnalyzed',
        data: { screenshotId, timestamp, analysis: imageAnalysis, teamId }
      });
      
      return imageAnalysis;
    } catch (error) {
      console.error('截圖處理失敗:', error);
      
      // 通知UI錯誤
      chrome.runtime.sendMessage({
        action: 'screenshotAnalysisError',
        error: error.message
      });
      
      throw error;
    }
  }

  // 獲取截圖分析詳細程度設置
  async getScreenshotDetailLevel() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['screenshot_detail_level'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting screenshot detail level:', chrome.runtime.lastError);
          resolve('medium'); // 默認值
        } else {
          resolve(result.screenshot_detail_level || 'medium');
        }
      });
    });
  }
}
