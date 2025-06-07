# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) that automatically captures and analyzes Teams meeting content. The extension records audio, transcribes it using OpenAI's Whisper API, captures screenshots, analyzes them with GPT-4 Vision, and provides AI-powered evaluation of team presentations for hackathon judging.

## Recent Updates (2025-01-06)

### UI/UX Improvements
1. **Icon Update**: Changed to larger, lighter green audio waveform icon for better visibility
   - Uses light green color scheme (#4ade80, #22c55e, #86efac)
   - Larger waveform bars with "AI" text
   - Better contrast in Chrome toolbar

2. **Meeting Note Helper Textarea**: Expanded to full extension window width
   - Increased min-height to 150px for better usability
   - Monospace font for code/template readability
   - Enhanced focus styles with blue border

3. **Copy to Clipboard Enhancement**: Now includes user prompt template
   - Copies full prompt with transcript as {context} when template exists
   - Falls back to transcript-only when no template is configured
   - Enables easy use with external LLM interfaces

## Architecture

### Core Components

- **Background Script** (`scripts/background.js`): Service worker that manages capture state, coordinates audio recording via offscreen document, handles screenshot capture, and processes API calls for transcription and image analysis
- **Offscreen Document** (`scripts/offscreen.js`): Handles MediaRecorder operations for audio capture using Web Audio API with speaker routing
- **Popup Interface** (`scripts/popup.js`): Main user interface for starting/stopping capture, team management, and settings configuration
- **API Service** (`scripts/apiService.js`): Manages OpenAI API interactions for both audio transcription and image analysis
- **Data Storage**: Dual storage system using both localStorage and IndexedDB for team data and transcripts

### Key Architectural Patterns

1. **Message Passing**: Heavy use of `chrome.runtime.onMessage` for communication between background script, popup, and offscreen document
2. **State Management**: Centralized capture state in background script with reactive UI updates via message broadcasting
3. **Audio Processing Pipeline**: Tab capture → offscreen MediaRecorder → background transcription → storage
4. **Dual Storage**: localStorage for team data persistence, IndexedDB for audio/image blobs (though IndexedDB implementation exists but localStorage is primary)

## Development Commands

This is a Chrome extension with no build process. Development workflow:

```bash
# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this directory

# For debugging, use Chrome DevTools:
# - Background script: chrome://extensions/ → inspect background script
# - Popup: Right-click extension icon → Inspect popup
# - Content scripts: F12 on Teams page
```

## Configuration

### Required Setup
- OpenAI API key for transcription and image analysis
- Chrome extension permissions: `tabCapture`, `activeTab`, `tabs`, `storage`, `downloads`, `offscreen`
- Teams meeting or audio-enabled webpage for testing

### Settings Storage
Settings are stored in both `localStorage` and `chrome.storage.local`:
- API keys and endpoints
- Model preferences (Whisper for audio, GPT-4o for screenshots)
- Feature toggles (screenshot analysis, audio download)
- Team data and transcript history
- **Meeting Note Helper Settings**: Customizable user prompt template for flexible meeting content processing

### Meeting Note Helper System
The extension includes a flexible meeting note processing system using customizable AI prompts:

**User Prompt Template**: Single configurable prompt template with `{context}` placeholder
- Stored in localStorage as `user_prompt_template`
- Default template generates comprehensive meeting summaries with:
  - Key discussion points
  - Action items with responsible parties
  - Decisions made
  - Next steps and deadlines
  - Additional important notes

**Template Examples**:
- Meeting Summary: Extract key points and action items
- Technical Review: Analyze technical discussions and provide recommendations  
- Project Status: Extract project updates and next steps
- Custom use cases: Any business need using the `{context}` parameter

## Key Implementation Details

### Audio Capture Flow
1. Background script calls `chrome.tabCapture.getMediaStreamId()`
2. Stream ID sent to offscreen document via message
3. Offscreen document uses `getUserMedia()` with stream ID
4. MediaRecorder captures 10-second segments
5. Audio data converted to base64 and sent to background
6. Background script calls OpenAI Whisper API for transcription

### Screenshot Analysis
- Automatic capture every 10 seconds during recording
- Uses `chrome.tabs.captureVisibleTab()` with permission checks
- Duplicate detection via dataURL comparison
- GPT-4 Vision API analysis with configurable detail levels

### Team Management
- Teams stored as JSON in localStorage with structure: `{id, name, transcripts[]}`
- Transcript chunks include both audio transcriptions and screenshot analyses
- Auto-save to team history when recording stops

## Common Issues

### Permission Problems
- Ensure all manifest permissions are granted in chrome://extensions/
- Tab capture requires user gesture and compatible tab (no chrome:// pages)
- Screenshot capture needs activeTab permission

### Audio Capture Failures
- Extension must be enabled and active tab must have audio
- MediaRecorder MIME type fallbacks: `audio/webm;codecs=opus` → `audio/webm` → `audio/ogg`
- Teams web version works better than desktop app capture

### API Integration
- Whisper model: `whisper-1` for transcription
- Vision models: `gpt-4o`, `gpt-4-turbo`, or `gpt-4` variants for screenshots
- Custom endpoints supported for alternative OpenAI-compatible APIs

## Testing

No automated test suite. Manual testing workflow:
1. Load extension in developer mode
2. Navigate to teams.microsoft.com or any audio-enabled page
3. Configure API key in extension settings
4. Create test team and start capture
5. Verify audio transcription and screenshot analysis in real-time
6. Check transcript history saves correctly

## Test Connection Button Behavior

The "Test Connection" button validates the OpenAI API configuration:

1. **Validates API Key**: Checks if API key is entered
2. **Tests API Endpoint**: Sends GET request to `/models` endpoint
3. **Fetches Available Models**: 
   - Filters out internal OpenAI models
   - Identifies vision-capable models for screenshot analysis
4. **Populates Dropdowns**:
   - AI Judge Model: All available models
   - Screenshot Model: Only vision-capable models (gpt-4o, gpt-4-turbo, gpt-4-vision, etc.)
5. **Restores Selections**: Attempts to restore previously saved model selections
6. **Shows Feedback**: Success/error messages to user

## File Structure Highlights

- `manifest.json`: Extension configuration and permissions
- `popup.html/popup.js`: Main UI, team management, and Meeting Note Helper settings configuration
- `scripts/background.js`: Core capture logic and API coordination  
- `scripts/offscreen.js`: Audio recording implementation
- `scripts/apiService.js`: OpenAI API wrapper with evaluation capabilities
- `scripts/evaluator.js`: AI evaluation logic using user prompt templates
- `scripts/dataStore.js`: IndexedDB wrapper for audio/image storage (optional storage layer)
- `history.html/history.js`: Transcript viewing, note processing, and export interface
- `dashboard.html`: Evaluation dashboard and scoring interface