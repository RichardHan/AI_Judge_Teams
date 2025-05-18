class APIService {
  constructor() {
    this.defaultEndpoint = 'https://api.openai.com/v1';
    this.settings = {
      apiKey: '',
      apiEndpoint: this.defaultEndpoint,
      model: 'gpt-4-turbo-preview',  // Default model
      maxTokens: 2000,
      temperature: 0.7
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    try {
      await this.loadSettings();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize APIService:', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      const storedSettings = await chrome.storage.sync.get('apiSettings');
      if (storedSettings.apiSettings) {
        this.settings = { ...this.settings, ...storedSettings.apiSettings };
      }
      return this.settings;
    } catch (error) {
      console.error('Failed to load API settings:', error);
      throw error;
    }
  }

  async saveSettings(settings) {
    try {
      this.settings = { ...this.settings, ...settings };
      await chrome.storage.sync.set({ apiSettings: this.settings });
    } catch (error) {
      console.error('Failed to save API settings:', error);
      throw error;
    }
  }

  async validateEndpoint(endpoint) {
    try {
      const response = await fetch(`${endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API endpoint validation failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        valid: true,
        models: data.data || []
      };
    } catch (error) {
      console.error('Endpoint validation error:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async generateEvaluation(transcript, screenshots) {
    try {
      const endpoint = this.settings.apiEndpoint;
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [
            {
              role: 'system',
              content: 'You are an AI hackathon judge. Analyze the presentation and provide detailed feedback.'
            },
            {
              role: 'user',
              content: this.prepareEvaluationPrompt(transcript, screenshots)
            }
          ],
          max_tokens: this.settings.maxTokens,
          temperature: this.settings.temperature
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return this.processEvaluationResponse(data);
    } catch (error) {
      console.error('Evaluation generation failed:', error);
      throw error;
    }
  }

  prepareEvaluationPrompt(transcript, screenshots) {
    // Prepare the evaluation prompt based on transcript and screenshots
    return `Please evaluate the following hackathon presentation:

Transcript:
${transcript}

Screenshots Analysis:
${this.analyzeScreenshots(screenshots)}

Please provide a detailed evaluation covering:
1. Technical Implementation
2. Innovation and Creativity
3. Presentation Quality
4. Team Collaboration
5. Overall Score (1-10)

Format the response in a structured way with clear sections and bullet points.`;
  }

  analyzeScreenshots(screenshots) {
    // Convert screenshots to analysis text
    return screenshots.map((screenshot, index) => 
      `Screenshot ${index + 1}: ${screenshot.description || 'No description available'}`
    ).join('\n');
  }

  processEvaluationResponse(data) {
    try {
      const evaluation = data.choices[0].message.content;
      return {
        success: true,
        evaluation,
        model: data.model,
        usage: data.usage
      };
    } catch (error) {
      console.error('Failed to process evaluation response:', error);
      throw new Error('Invalid API response format');
    }
  }

  async transcribeAudio(audioBlob) {
    try {
      const endpoint = this.settings.apiEndpoint;
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');

      const response = await fetch(`${endpoint}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        text: data.text
      };
    } catch (error) {
      console.error('Audio transcription failed:', error);
      throw error;
    }
  }
}

// Create and initialize the service
const apiService = new APIService();
apiService.initialize().then(() => {
  window.APIService = apiService;
}).catch(error => {
  console.error('Failed to initialize APIService:', error);
});