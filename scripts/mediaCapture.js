class MediaCaptureManager {
  constructor(options = {}) {
    this.options = {
      captureInterval: 60000, // 捕獲間隔（毫秒）
      overlapDuration: 10000, // 重疊時間（毫秒）
      screenshotInterval: 60000, // 截圖間隔（毫秒）
      ...options
    };
    
    this.mediaRecorder = null;
    this.currentStream = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.captureTimer = null;
    this.screenshotTimer = null;
  }
  
  // 初始化捕獲，支援兩種模式：tabCapture或desktopCapture
  async initialize(captureMode = 'tab') {
    try {
      if (captureMode === 'tab') {
        // 捕獲當前標籤頁
        this.currentStream = await chrome.tabCapture.capture({
          audio: true,
          video: true,
          videoConstraints: {
            mandatory: {
              minWidth: 1280,
              minHeight: 720
            }
          }
        });
      } else {
        // 請求用戶選擇桌面或窗口
        const sources = await new Promise(resolve => {
          chrome.desktopCapture.chooseDesktopMedia(
            ['screen', 'window'], 
            resolve
          );
        });
        
        if (!sources) throw new Error('用戶取消了捕獲');
        
        this.currentStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources
            }
          },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sources,
              minWidth: 1280,
              minHeight: 720
            }
          }
        });
      }
      
      return true;
    } catch (error) {
      console.error('媒體捕獲初始化失敗:', error);
      return false;
    }
  }
  
  // 開始錄製
  startRecording() {
    if (!this.currentStream || this.isRecording) return false;
    
    this.mediaRecorder = new MediaRecorder(this.currentStream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
    
    this.mediaRecorder.onstop = () => {
      this._processAudioSegment();
    };
    
    this.mediaRecorder.start();
    this.isRecording = true;
    
    // 設置定時器，每(captureInterval-overlapDuration)時間停止一次
    const effectiveInterval = this.options.captureInterval - this.options.overlapDuration;
    this.captureTimer = setInterval(() => {
      this._handleSegmentCapture();
    }, effectiveInterval);
    
    // 設置截圖定時器
    this.screenshotTimer = setInterval(() => {
      this._captureScreenshot();
    }, this.options.screenshotInterval);
    
    return true;
  }
  
  // 停止錄製
  stopRecording() {
    if (!this.isRecording) return false;
    
    clearInterval(this.captureTimer);
    clearInterval(this.screenshotTimer);
    
    this.mediaRecorder.stop();
    this.isRecording = false;
    
    return true;
  }
  
  // 處理分段捕獲
  _handleSegmentCapture() {
    if (!this.isRecording) return;
    
    // 停止當前錄製
    this.mediaRecorder.stop();
    
    // 短暫延遲後開始新的錄製（保持連續性）
    setTimeout(() => {
      this.audioChunks = [];
      this.mediaRecorder.start();
    }, 100);
  }
  
  // 處理音訊段落，發送到處理器
  async _processAudioSegment() {
    if (this.audioChunks.length === 0) return;
    
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const timestamp = new Date().toISOString();
    
    // 發送到音訊處理器
    const audioProcessor = new AudioProcessor();
    await audioProcessor.processAudioSegment(audioBlob, timestamp);
    
    // 清空緩存
    this.audioChunks = [];
  }
  
  // 捕獲屏幕截圖
  async _captureScreenshot() {
    if (!this.currentStream) return;
    
    try {
      const videoTrack = this.currentStream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(videoTrack);
      const bitmap = await imageCapture.grabFrame();
      
      // 創建canvas並繪製圖像
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);
      
      // 轉換為Blob
      const imageBlob = await new Promise(resolve => {
        canvas.toBlob(resolve, 'image/jpeg', 0.85);
      });
      
      // 處理截圖
      const timestamp = new Date().toISOString();
      const screenshotManager = new ScreenshotManager();
      await screenshotManager.processScreenshot(imageBlob, timestamp);
    } catch (error) {
      console.error('截圖失敗:', error);
    }
  }
}