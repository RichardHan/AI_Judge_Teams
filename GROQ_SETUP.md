# Using Groq's Whisper Large v3 Turbo with AI Judge Teams

## Quick Setup

1. **Get a Groq API Key**
   - Sign up at https://console.groq.com
   - Generate an API key from your dashboard

2. **Configure the Extension**
   - Open the extension popup
   - Click the settings gear icon
   - Fill in these fields:
     - **API Endpoint (For Speech to Text)**: `https://api.groq.com/openai/v1`
     - **API Key (For Speech to Text)**: Your Groq API key
     - **Speech-to-Text Model**: `whisper-large-v3-turbo`

3. **Test the Connection**
   - Click "Test Audio" to verify Groq is working
   - Start recording and verify transcriptions are working

## Why Use Groq?

- **Speed**: Groq's LPU inference is extremely fast - transcriptions complete in seconds
- **Cost**: Very competitive pricing compared to OpenAI
- **Quality**: Whisper Large v3 Turbo offers excellent accuracy
- **Reliability**: High uptime and consistent performance

## Supported Audio Formats

The extension sends audio as WebM format, which Groq accepts. The audio is automatically:
- Captured in 10-second segments (configurable)
- Encoded as WebM with Opus codec
- Sent to Groq for transcription

## Troubleshooting

1. **"Transcription API request failed"**
   - Verify your API key is correct
   - Check that the endpoint is exactly: `https://api.groq.com/openai/v1`
   - Ensure your Groq account has credits

2. **Empty transcriptions**
   - Make sure the audio source has sound
   - Try testing with a YouTube video or music first
   - Check browser console for detailed error messages

## Advanced Configuration

You can also use multiple STT providers simultaneously:
- Keep OpenAI as your main API for GPT features
- Use Groq specifically for speech-to-text (faster & cheaper)
- The extension will automatically route requests to the right service