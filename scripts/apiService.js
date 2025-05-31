class APIService {
  constructor() {
    this.defaultEndpoint = 'https://api.openai.com/v1';
    this.settings = {
      apiKey: '',
      apiEndpoint: this.defaultEndpoint,
      model: 'gpt-4.1-nano',  // 預設使用 gpt-4.1-nano
      maxTokens: 2000,
      temperature: 0.7
    };
    this.initialized = false;
    this.availableModels = [];
  }

  async initialize() {
    if (this.initialized) return;

    // Load settings from storage
    const storedSettings = await this.loadSettings();
    if (storedSettings) {
      this.settings = { ...this.settings, ...storedSettings };
    }

    // Validate endpoint and get available models
    if (this.settings.apiKey && this.settings.apiEndpoint) {
      const validation = await this.validateEndpoint(this.settings.apiEndpoint);
      if (validation.valid) {
        this.availableModels = validation.models;
      }
    }

    this.initialized = true;
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['apiSettings'], (result) => {
        resolve(result.apiSettings || null);
      });
    });
  }

  async saveSettings(settings) {
    // Validate endpoint before saving
    if (settings.apiEndpoint && settings.apiKey) {
      const validation = await this.validateEndpoint(settings.apiEndpoint);
      if (!validation.valid) {
        throw new Error(`無效的 API endpoint: ${validation.error}`);
      }
      
      // 驗證選擇的模型是否可用
      if (settings.model && !validation.models.includes(settings.model)) {
        throw new Error(`無效的模型選擇: ${settings.model}`);
      }
      
      this.availableModels = validation.models;
    }

    this.settings = { ...this.settings, ...settings };
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ apiSettings: this.settings }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  async validateEndpoint(endpoint) {
    console.log('APIService: Starting endpoint validation for:', endpoint);
    try {
      // Remove trailing slash if present
      endpoint = endpoint.replace(/\/$/, '');
      
      console.log('APIService: Sending request to:', `${endpoint}/models`);
      const response = await fetch(`${endpoint}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('APIService: Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('APIService: Validation failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        throw new Error(`API endpoint validation failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('APIService: Received models:', data.data?.length || 0, 'models');
      
      const models = data.data || [];
      const availableModels = models
        .filter(model => {
          const id = model.id || model;
          return !id.includes('embedding') && !id.includes('whisper');
        })
        .map(model => model.id || model)
        .sort();

      console.log('APIService: Available models:', availableModels);
      return {
        valid: true,
        models: availableModels
      };
    } catch (error) {
      console.error('APIService: Validation error:', error);
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
        throw new Error(`API endpoint validation failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('API endpoint validation failed:', error);
      throw error;
    }
  }

  async analyzeImage(imageBlob, detailLevel = 'medium') {
    try {
      // Ensure API service is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.settings.apiKey) {
        throw new Error('No API key configured for image analysis');
      }

      // Convert blob to base64 data URL
      const imageDataUrl = await this.blobToDataUrl(imageBlob);
      
      // Determine prompt based on detail level
      let prompt;
      switch (detailLevel) {
        case 'low':
          prompt = 'Briefly describe what is happening in this screenshot in 1-2 sentences.';
          break;
        case 'high':
          prompt = 'Provide a detailed analysis of this screenshot, including all visible text, UI elements, user actions, and any important context that might be relevant for meeting documentation.';
          break;
        case 'medium':
        default:
          prompt = 'Describe what is happening in this screenshot, focusing on key activities, visible text, and important UI elements.';
          break;
      }

      // Use vision-capable model (default to gpt-4o if current model doesn't support vision)
      const visionModel = this.settings.model.includes('gpt-4') ? this.settings.model : 'gpt-4o';
      
      const endpoint = this.settings.apiEndpoint;
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.settings.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: visionModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl
                  }
                }
              ]
            }
          ],
          max_tokens: detailLevel === 'high' ? 500 : (detailLevel === 'low' ? 100 : 300),
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Image analysis API request failed: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from image analysis API');
      }
      
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Image analysis failed:', error);
      throw error;
    }
  }

  // Helper method to convert blob to data URL
  async blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// Create and initialize the service
console.log('Creating APIService instance...');
window.APIService = new APIService();
console.log('Starting APIService initialization...');
window.APIService.initialize().then(() => {
  console.log('APIService successfully initialized and attached to window');
}).catch(error => {
  console.error('Failed to initialize APIService:', error);
  alert('API 服務初始化失敗: ' + error.message);
});
