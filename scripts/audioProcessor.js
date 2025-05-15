class AudioProcessor {
  constructor() {
    this.apiService = new ApiService();
    this.dataStore = new DataStore();
  }
  
  // 處理音訊段落
  async processAudioSegment(audioBlob, timestamp) {
    try {
      // 先存儲原始音訊
      const audioId = await this.dataStore.saveAudioSegment(audioBlob, timestamp);
      
      // 轉換為MP3（可選）
      const mp3Blob = await this._convertToMP3(audioBlob);
      
      // 發送到Whisper API
      const transcription = await this.apiService.transcribeAudio(mp3Blob);
      
      // 存儲轉錄結果
      await this.dataStore.saveTranscription(audioId, transcription, timestamp);
      
      // 通知UI更新
      chrome.runtime.sendMessage({
        action: 'transcriptionComplete',
        data: { audioId, timestamp, text: transcription.text }
      });
      
      return transcription;
    } catch (error) {
      console.error('音訊處理失敗:', error);
      throw error;
    }
  }
  
  // 轉換為MP3格式（使用Web Audio API）
  async _convertToMP3(webmBlob) {
    // 可選，如果需要可以實現
    // 實際部署時可以直接使用webm格式，Whisper API支援
    return webmBlob;
  }
}