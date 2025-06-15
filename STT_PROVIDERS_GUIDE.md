# Speech-to-Text Provider Guide

## Overview

The Teams Meeting Assistant now supports multiple STT (Speech-to-Text) providers with an easy-to-use dropdown selection system. You can quickly switch between predefined providers or use your own custom endpoint.

## Supported Providers

### 1. **OpenAI** (Default)
- **Endpoint**: `https://api.openai.com/v1`
- **Available Models**:
  - `whisper-1` - Standard model (legacy, stable)
  - `gpt-4o-mini-transcribe` - Faster and cheaper
  - `gpt-4o-transcribe` - Most accurate

### 2. **Trend Micro AI Endpoint**
- **Endpoint**: `https://api.rdsec.trendmicro.com/prod/aiendpoint/v1`
- **Available Models**:
  - `whisper-1` - Balanced performance

### 3. **Groq** (Fast & Cheap)
- **Endpoint**: `https://api.groq.com/openai/v1`
- **Available Models**:
  - `whisper-large-v3-turbo` - Fastest, cheapest, average accuracy

### 4. **Custom**
- Enter your own OpenAI-compatible endpoint
- Enter any model name your endpoint supports

## How to Use

1. **Open Extension Settings**
   - Click the gear icon (⚙️) in the extension popup

2. **Select STT Provider**
   - Choose from the dropdown: OpenAI, Trend Micro, Groq, or Custom
   - The endpoint will be automatically set based on your selection

3. **Select Model**
   - Choose from the available models for your selected provider
   - Each model shows a description (e.g., "Faster, cheaper")
   - Select "Custom Model..." to enter any model name

4. **Enter API Key**
   - Use the "API Key (For Speech to Text)" field
   - Each provider requires its own API key

5. **Test Your Configuration**
   - Click "Test Audio" to verify your settings work

## Provider-Specific Notes

### OpenAI
- Requires OpenAI API key (starts with `sk-`)
- Best for general use with good accuracy
- Supports multiple model options

### Trend Micro
- Internal endpoint for Trend Micro users
- Requires Trend Micro API credentials
- Uses standard whisper-1 model

### Groq
- Requires Groq API key (starts with `gsk_`)
- Extremely fast processing
- Most cost-effective option
- See [GROQ_SETUP.md](GROQ_SETUP.md) for detailed setup

### Custom
- For self-hosted Whisper servers
- For other OpenAI-compatible APIs
- Full flexibility in endpoint and model selection

## Switching Providers

When you switch providers:
1. The endpoint is automatically updated
2. The model dropdown shows only compatible models
3. Your selection is saved for future use
4. You may need to update the API key

## Troubleshooting

- **"Select a model..." message**: You must select a model after choosing a provider
- **Custom fields not showing**: Select "Custom" provider or "Custom Model..." option
- **API errors**: Verify your API key matches the selected provider
- **Model not working**: Ensure the model is supported by your selected provider

## Advanced Usage

### Using Custom Models with Predefined Providers
All providers support a "Custom Model..." option, allowing you to:
- Use newer models not yet in the dropdown
- Test experimental models
- Use provider-specific model variants

### Endpoint Format
- Most endpoints should end with `/v1` (added automatically for OpenAI)
- Custom endpoints can use any format your API requires
- Do not include `/audio/transcriptions` - this is added automatically