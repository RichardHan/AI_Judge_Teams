# Test Progressive Save and Stop Recording Fix

## Test Scenarios

### Test 1: Progressive Saving During Recording
1. Start recording for a team
2. Let it record for at least 1 minute to get some transcripts
3. Wait for the 30-second progressive save interval
4. Open Teams History page in a new tab
5. Verify that you see a transcript marked as "(Recording...)"
6. The progressive transcript should update every 30 seconds

### Test 2: Stop Recording with Pending API Calls
1. Start recording
2. Record for 2-3 minutes to accumulate transcripts
3. Click Stop Recording
4. Immediately switch to Teams History
5. Verify that:
   - The recording stops
   - A message shows "正在停止錄音並等待所有轉錄完成..."
   - After completion, the transcript is saved properly
   - No data is lost

### Test 3: Popup Closed During Save
1. Start recording
2. Record for 2-3 minutes
3. Click Stop Recording
4. Immediately close the popup window
5. Wait 20 seconds
6. Reopen the popup and go to Teams History
7. Verify that the transcript was saved via the fallback mechanism

### Test 4: Grace Period for Late Transcriptions
1. Start recording
2. Record for several minutes
3. Click Stop Recording
4. The system should wait up to 15 seconds for any pending transcriptions
5. Verify that late-arriving transcriptions are included in the final save

### Test 5: Recovery from Failed Save
1. Open Chrome DevTools > Application > Local Storage
2. Fill up localStorage to near capacity (you can manually add large data)
3. Start recording and record for a minute
4. Click Stop Recording
5. The system should:
   - Attempt to save 3 times
   - If all fail, save to chrome.storage as emergency backup
   - Show appropriate error messages

### Test 6: Check Pending Saves on Startup
1. Simulate a failed save by closing popup during save
2. Close and reopen the extension popup
3. The popup should automatically check for and process any pending saves
4. You should see a message like "Successfully recovered X transcript(s) from background saves"

## Expected Behavior

- **Progressive Saves**: Every 30 seconds during recording, the transcript is saved as a "progressive" version
- **Grace Period**: After clicking stop, the system continues accepting transcriptions for up to 15 seconds
- **Retry Logic**: Failed saves are retried up to 3 times with 500ms delays
- **Fallback Storage**: If localStorage fails, data is saved to chrome.storage.local
- **Auto Recovery**: On popup startup, any pending saves are automatically processed

## Console Logs to Watch

In the background script console:
- `[BACKGROUND_SCRIPT] Progressive save triggered`
- `[BACKGROUND_SCRIPT] Still accepting transcriptions for grace period`
- `[BACKGROUND_SCRIPT] Maximum wait time (15s) reached, performing save`

In the popup console:
- `[POPUP_SCRIPT] Saving progressive transcript`
- `[POPUP_SCRIPT] Checking for pending saves from background`
- `[POPUP_SCRIPT] Successfully recovered X transcript(s) from background saves`