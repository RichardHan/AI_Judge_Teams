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

  async processWithUserPrompt(userPromptTemplate, transcriptContent) {
    try {
      // Ensure API service is initialized
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.settings.apiKey) {
        throw new Error('No API key configured for processing');
      }

      // Replace {context} placeholder with actual transcript content
      const finalPrompt = userPromptTemplate.replace(/{context}/g, transcriptContent);

      const endpoint = this.settings.apiEndpoint;
      
      // Add timeout control
      const controller = new AbortController();
      const timeoutMs = 60000; // 60 second timeout
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const requestBody = {
          model: this.settings.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: finalPrompt
            }
          ],
          max_tokens: 2000,
          temperature: 0.7
        };
        
        console.log('[APIService] Sending chat completion request:', {
          endpoint: `${endpoint}/chat/completions`,
          model: requestBody.model,
          promptLength: finalPrompt.length,
          promptPreview: finalPrompt.substring(0, 200) + '...',
          maxTokens: requestBody.max_tokens,
          temperature: requestBody.temperature,
          timestamp: new Date().toISOString()
        });
        
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.settings.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorData.error?.message || errorData.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error('[APIService] Invalid response format:', data);
          throw new Error('Invalid response format from API');
        }
        
        const result = data.choices[0].message.content;
        
        console.log('[APIService] Chat completion successful:', {
          model: data.model || requestBody.model,
          usage: data.usage,
          responseLength: result.length,
          responsePreview: result.substring(0, 200) + '...',
          timestamp: new Date().toISOString()
        });
        
        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout after 60 seconds');
        }
        throw error;
      }
    } catch (error) {
      console.error('User prompt processing failed:', error);
      throw error;
    }
  }

  // Legacy method - keeping for backward compatibility but will use user prompt template
  async generateEvaluation(transcript, screenshots) {
    try {
      // Get user prompt template from localStorage, fallback to a simple evaluation prompt
      const userPromptTemplate = localStorage.getItem('user_prompt_template') || 
        'Please analyze and summarize the following meeting content:\n\n{context}';
      
      // Prepare transcript content
      const transcriptContent = this.prepareTranscriptContent(transcript, screenshots);
      
      // Use the new processWithUserPrompt method
      return await this.processWithUserPrompt(userPromptTemplate, transcriptContent);
    } catch (error) {
      console.error('Legacy evaluation method failed:', error);
      throw error;
    }
  }

  // Helper method to prepare transcript content
  prepareTranscriptContent(transcript, screenshots) {
    let content = '';
    
    if (transcript) {
      if (typeof transcript === 'string') {
        content = transcript;
      } else if (transcript.text) {
        content = transcript.text;
      } else if (transcript.chunks && Array.isArray(transcript.chunks)) {
        content = transcript.chunks.map(chunk => {
          if (chunk.type === 'screenshot' || chunk.type === 'screenshot_analysis') {
            return `[Screenshot Analysis: ${chunk.analysis}]`;
          }
          return chunk.text || chunk.analysis || '';
        }).join('\n');
      }
    }
    
    if (screenshots && Array.isArray(screenshots)) {
      const screenshotAnalyses = screenshots.map(screenshot => 
        `[Screenshot Analysis: ${screenshot.analysis || 'No analysis available'}]`
      ).join('\n');
      
      if (screenshotAnalyses) {
        content += (content ? '\n\n' : '') + screenshotAnalyses;
      }
    }
    
    return content || 'No content available';
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
      // All prompts now include instruction to ignore Teams UI
      const baseInstruction = 'This is a screenshot from Microsoft Teams. Please focus ONLY on the shared content in the center of the screen and ignore all Teams UI elements such as the toolbar, participant list, chat panel, meeting controls, or any Teams interface buttons. ';
      
      let prompt;
      switch (detailLevel) {
        case 'low':
          prompt = baseInstruction + 'Briefly describe the main shared content in 1-2 sentences.';
          break;
        case 'high':
          prompt = baseInstruction + 'Provide a detailed analysis of the shared content only, including all visible text, diagrams, code, presentations, or documents being shared. Do not mention any Teams interface elements.';
          break;
        case 'medium':
        default:
          prompt = baseInstruction + 'Describe the shared content, focusing on key information, visible text, diagrams, or presentations. Ignore all Teams UI elements around the edges.';
          break;
      }

      // Use vision-capable model (default to gpt-4o if current model doesn't support vision)
      const visionModel = this.settings.model.includes('gpt-4') ? this.settings.model : 'gpt-4o';
      
      const endpoint = this.settings.apiEndpoint;
      
      // Add timeout control for image analysis
      const controller = new AbortController();
      const timeoutMs = 45000; // 45 second timeout for image analysis
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const requestBody = {
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
        };
        
        console.log('[APIService] Sending image analysis request:', {
          endpoint: `${endpoint}/chat/completions`,
          model: requestBody.model,
          detailLevel: detailLevel,
          maxTokens: requestBody.max_tokens,
          imageSize: imageBlob.size,
          timestamp: new Date().toISOString()
        });
        
        const response = await fetch(`${endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.settings.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody)
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Image analysis API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error('[APIService] Invalid image analysis response format:', data);
          throw new Error('Invalid response format from image analysis API');
        }
        
        const result = data.choices[0].message.content;
        
        console.log('[APIService] Image analysis successful:', {
          model: data.model || requestBody.model,
          usage: data.usage,
          responseLength: result.length,
          responsePreview: result.substring(0, 200) + '...',
          timestamp: new Date().toISOString()
        });
        
        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Image analysis timeout after 45 seconds');
        }
        throw error;
      }
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
