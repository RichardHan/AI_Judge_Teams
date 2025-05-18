class ScreenshotManager {
  constructor() {
    this.apiService = new ApiService();
    this.dataStore = new DataStore();
  }
  
  // 處理截圖
  async processScreenshot(imageBlob, timestamp) {
    try {
      // 先存儲原始截圖
      const screenshotId = await this.dataStore.saveScreenshot(imageBlob, timestamp);
      
      // 發送到GPT-4o進行分析
      const imageAnalysis = await this.apiService.analyzeImage(imageBlob);
      
      // 存儲分析結果
      await this.dataStore.saveImageAnalysis(screenshotId, imageAnalysis, timestamp);
      
      // 通知UI更新
      chrome.runtime.sendMessage({
        action: 'screenshotAnalyzed',
        data: { screenshotId, timestamp, analysis: imageAnalysis }
      });
      
      return imageAnalysis;
    } catch (error) {
      console.error('截圖處理失敗:', error);
      throw error;
    }
  }
}