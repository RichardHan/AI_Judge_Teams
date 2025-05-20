# AI_Judge_Teams
chrome extension

# AI Hackathon Judge

AI Hackathon Judge is a Chrome extension designed to automatically capture Teams meeting content and perform AI-powered analysis and scoring. It can:
- Capture Teams meeting screen content
- Record and transcribe meeting audio
- Automatically capture screenshots at key moments
- Generate AI-powered evaluation reports

## Installation

### Method 1: Install from Chrome Web Store (Recommended)
1. Visit the Chrome Web Store (Coming Soon)
2. Click "Add to Chrome"
3. Confirm installation permissions
4. The extension icon will appear in your Chrome toolbar

### Method 2: Developer Mode Installation
1. Download or clone this repository
2. Open Chrome browser and navigate to the extensions page:
   - Enter `chrome://extensions/` in the address bar
   - Or click Menu -> More Tools -> Extensions
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the root directory of this project
6. The extension will be installed in Chrome

## Prerequisites

1. Get an OpenAI API Key:
   - Visit [OpenAI API page](https://platform.openai.com/api-keys)
   - Create a new API Key
   - Enter the API Key in the extension settings

2. Ensure Microsoft Teams desktop app is installed or use Teams web version

## Usage

### Basic Operations
1. Click the extension icon in the Chrome toolbar to open the control panel
2. Enter your OpenAI API Key in the settings panel
3. Select capture mode (tab capture or desktop capture)
4. Click "Start Capture" to begin recording the meeting
5. Click "Stop Capture" to end recording
6. Click "Open Dashboard" to view analysis results

### Dashboard Features
- View recordings for all participating teams
- Browse meeting transcriptions
- View screenshots of key moments
- Generate AI evaluation reports
- Manage team information

## Important Notes

1. Required Permissions:
   - Screen capture permission
   - Microphone access permission
   - Storage permission

2. Usage Limitations:
   - Microsoft Teams meetings only
   - Requires stable internet connection
   - API calls may incur costs

3. Privacy Statement:
   - All data is stored locally
   - OpenAI API is only called for evaluation generation
   - Meeting content is not uploaded or shared

## Developer Information

### Tech Stack
- Chrome Extension Manifest V3
- OpenAI API
- WebRTC
- Chrome Storage API

### Directory Structure
```
AI_Judge_Teams/
├── icons/              # Extension icons
├── scripts/            # Core scripts
│   ├── background.js   # Background service
│   ├── content.js      # Content scripts
│   └── ...
├── styles/             # Style files
├── views/              # View scripts
├── manifest.json       # Extension configuration
├── popup.html          # Popup window
└── dashboard.html      # Dashboard page
```

## Troubleshooting

1. If capture fails to start:
   - Check if all required permissions are granted
   - Verify Teams meeting is in progress
   - Try switching capture modes

2. If evaluation generation fails:
   - Verify API Key is correct
   - Check internet connection
   - Review API usage quota

3. If a "Save As" dialog appears unexpectedly when saving recordings:
   - Check Chrome's download settings. Go to `chrome://settings/downloads` and ensure that "Ask where to save each file before downloading" is turned OFF. This global Chrome setting can override the extension's attempt to save files directly.

4. If extension becomes unresponsive:
   - Reload the extension
   - Clear browser cache
   - Reinstall the extension

## Support and Feedback

For issues or suggestions, please:
1. Submit an Issue
2. Send email to: [To be added]
3. Post in discussion forum: [To be added]

## License

MIT License - See LICENSE file for details
