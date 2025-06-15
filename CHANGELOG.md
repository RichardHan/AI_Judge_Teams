# Changelog

## Version 1.2 (2025-01-14)

### New Features
- **STT Provider Selection System**: Added dropdown selection for Speech-to-Text providers
  - Predefined providers: OpenAI, Trend Micro, and Groq
  - Each provider shows only its compatible models
  - Custom provider option for full flexibility
  - Model descriptions for better user understanding

### Supported Providers and Models
1. **OpenAI** (Default)
   - whisper-1 (Standard model - legacy)
   - gpt-4o-mini-transcribe (Faster, cheaper)
   - gpt-4o-transcribe (Most accurate)

2. **Trend Micro AI Endpoint**
   - whisper-1 (Balanced performance)

3. **Groq**
   - whisper-large-v3-turbo (Fastest, cheapest, average accuracy)

4. **Custom**
   - Any OpenAI-compatible endpoint
   - Any model name

### Improvements
- Better error handling for Groq API with detailed error messages
- Added response format compatibility for various providers
- File extension adaptation for better provider compatibility
- Model validation before starting recording
- Auto-open settings if STT configuration is incomplete
- Provider-specific API key validation

### UI/UX Enhancements
- Clean dropdown interface for provider selection
- Dynamic model dropdown based on selected provider
- Custom input fields only shown when needed
- Model descriptions displayed for each option
- Visual indicators in dropdown for different providers

### Bug Fixes
- Fixed async/await syntax errors in save functions
- Improved error logging for transcription failures
- Better handling of different API response formats

### Documentation
- Added STT_PROVIDERS_GUIDE.md for provider setup
- Updated GROQ_SETUP.md with troubleshooting
- Added GROQ_TROUBLESHOOTING.md for common issues

## Version 1.1
- Previous features...