# Testing STT Provider Selection

## Test Scenarios

### 1. Initial Setup Test
1. Open extension popup
2. Click settings (⚙️)
3. Verify STT Provider dropdown shows "OpenAI (Default)"
4. Verify model dropdown is populated with OpenAI models

### 2. Provider Switching Test
1. **OpenAI → Groq**
   - Select "Groq (Fast & Cheap)" from provider dropdown
   - Verify model dropdown updates to show only "whisper-large-v3-turbo"
   - Verify endpoint is automatically set (visible in browser console)
   
2. **Groq → Trend Micro**
   - Select "Trend Micro AI Endpoint"
   - Verify model dropdown shows only "whisper-1"
   
3. **Trend Micro → Custom**
   - Select "Custom Endpoint"
   - Verify custom endpoint input field appears
   - Verify custom model input field appears
   - Verify model dropdown is cleared

### 3. Model Selection Test
1. Select OpenAI provider
2. Choose "gpt-4o-mini-transcribe"
3. Verify description shows "Faster, cheaper"
4. Select "Custom Model..."
5. Verify custom model input field appears

### 4. Validation Test
1. Clear all STT settings (model and API key)
2. Try to start recording
3. Verify error message appears asking to select STT model
4. Verify settings panel opens automatically

### 5. API Key Validation Test
1. Select Groq provider
2. Clear STT API Key field
3. Try to start recording
4. Verify error message asks for Groq API key specifically

### 6. Settings Persistence Test
1. Configure settings:
   - Provider: Groq
   - Model: whisper-large-v3-turbo
   - API Key: test-key
2. Close and reopen extension
3. Verify all settings are restored correctly

### 7. Custom Provider Test
1. Select "Custom Endpoint"
2. Enter custom endpoint: `http://localhost:8000/v1`
3. Enter custom model: `whisper-medium`
4. Start recording
5. Check console for correct endpoint being used

### 8. Recording Test with Each Provider
Test actual recording with each provider (requires valid API keys):

1. **OpenAI Test**
   - Use model: gpt-4o-mini-transcribe
   - Record 10 seconds of audio
   - Verify transcription appears

2. **Groq Test**
   - Use model: whisper-large-v3-turbo
   - Record 10 seconds of audio
   - Verify fast transcription

3. **Trend Micro Test** (internal users only)
   - Use model: whisper-1
   - Verify endpoint connectivity

## Expected Console Logs

When switching providers, check browser console for:
```
[POPUP_SCRIPT] Provider changed to: groq
[POPUP_SCRIPT] Endpoint set to: https://api.groq.com/openai/v1
[POPUP_SCRIPT] Model selected: whisper-large-v3-turbo
```

## Troubleshooting

- If models don't appear: Check STT_PROVIDERS object in popup.js
- If custom fields don't show: Check display style in CSS
- If settings don't save: Check localStorage in DevTools
- If API fails: Check endpoint format and API key