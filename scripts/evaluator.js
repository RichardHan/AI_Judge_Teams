class Evaluator {
  constructor() {
    this.apiService = new ApiService();
    this.dataStore = new DataStore();
  }
  
  // 執行評估
  async evaluateTeam(teamId) {
    try {
      // 獲取團隊信息
      const team = await this.dataStore.getTeam(teamId);
      if (!team) {
        throw new Error(`找不到ID為${teamId}的團隊`);
      }
      
      // 獲取團隊的所有轉錄
      const transcriptions = await this.dataStore.getTeamTranscriptions(teamId);
      
      // 獲取團隊的所有圖像分析
      const imageAnalyses = await this.dataStore.getTeamImageAnalyses(teamId);
      
      // 準備評估數據
      const presentationData = {
        teamName: team.name,
        projectName: team.projectName,
        transcriptions: transcriptions.map(t => ({
          timestamp: t.timestamp,
          text: t.text
        })),
        screenshots: imageAnalyses.map(s => ({
          timestamp: s.timestamp,
          analysis: s.analysis
        }))
      };
      
      // 執行API評估
      const evaluationResult = await this.apiService.evaluatePresentation(presentationData);
      
      // 保存評估結果
      const evaluationId = await this.dataStore.saveEvaluation({
        teamId,
        result: evaluationResult,
        timestamp: new Date().toISOString()
      });
      
      // 返回評估結果
      return {
        id: evaluationId,
        result: evaluationResult
      };
    } catch (error) {
      console.error('評估失敗:', error);
      throw error;
    }
  }
}