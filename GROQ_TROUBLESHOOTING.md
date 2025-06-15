# Groq API Troubleshooting Guide

## Common Errors and Solutions

### 1. Authentication Error (401 Unauthorized)
**Error**: `Transcription API request failed: 401 Unauthorized`

**Solution**:
- Verify your Groq API key is correct
- Make sure you're using the STT API Key field, not the main OpenAI API Key field
- Check that your API key starts with `gsk_`
- Ensure your Groq account is active and has credits

### 2. Model Not Found Error (404)
**Error**: `Transcription API request failed: 404 Not Found`

**Solution**:
- Verify the model name is exactly: `whisper-large-v3-turbo`
- Ensure the endpoint is: `https://api.groq.com/openai/v1` (without trailing slash)
- Check Groq's documentation for any model name changes

### 3. Invalid Audio Format Error (400)
**Error**: `Transcription API request failed: 400 Bad Request`

**Possible causes**:
- Groq may not support WebM format well
- Audio file might be corrupted or empty

**Solution**:
- The extension now sends the file as `.m4a` extension for Groq compatibility
- Ensure the audio source has actual sound
- Try with a different audio source (YouTube video, music, etc.)

### 4. Rate Limit Error (429)
**Error**: `Transcription API request failed: 429 Too Many Requests`

**Solution**:
- Groq has rate limits on API usage
- Increase the "Transcription Interval" in settings to 20-30 seconds
- Check your Groq dashboard for rate limit details

## Debugging Steps

1. **Check Browser Console**:
   - Open Chrome DevTools (F12)
   - Go to the extension's background page console
   - Look for `[BACKGROUND_SCRIPT]` logs
   - Check for "API Error Response" messages

2. **Verify Configuration**:
   ```
   STT API Endpoint: https://api.groq.com/openai/v1
   STT API Key: gsk_your_api_key_here
   Speech-to-Text Model: whisper-large-v3-turbo
   ```

3. **Test with Curl**:
   ```bash
   curl "https://api.groq.com/openai/v1/audio/transcriptions" \
     -H "Authorization: Bearer YOUR_GROQ_API_KEY" \
     -F "model=whisper-large-v3-turbo" \
     -F "file=@test_audio.mp3" \
     -F "response_format=json"
   ```

4. **Check Audio Quality**:
   - Enable "Download Audio Files" in settings
   - Check the downloaded WebM files in Downloads/audio_capture/
   - Verify they contain actual audio

## Alternative Solutions

If Groq continues to have issues:

1. **Use OpenAI's Whisper API**:
   - Clear the STT API Endpoint field
   - Use your OpenAI API key
   - Model: `whisper-1`

2. **Try a Different Groq Model**:
   - Groq may support other Whisper models
   - Check https://console.groq.com/docs for latest models

3. **Adjust Capture Settings**:
   - Increase transcription interval to reduce API calls
   - Try recording from different audio sources

## Getting Help

1. Check Groq's status page: https://status.groq.com/
2. Review Groq's documentation: https://console.groq.com/docs
3. Contact Groq support with the specific error message