chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "testTabCapture") {
    console.log("[MRE Background] Received testTabCapture message.");
    console.log("[MRE Background] Checking chrome.tabCapture:", chrome.tabCapture);
    
    if (chrome.tabCapture && typeof chrome.tabCapture.capture === 'function') {
      console.log("[MRE Background] chrome.tabCapture.capture IS a function. Attempting capture...");
      chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
        if (chrome.runtime.lastError) {
          console.error("[MRE Background] TabCapture failed:", chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (stream) {
          console.log("[MRE Background] TabCapture successful! Stream received.");
          // Stop the stream immediately for this test
          stream.getTracks().forEach(track => track.stop());
          sendResponse({ success: true, message: "TabCapture successful!" });
        } else {
          console.error("[MRE Background] TabCapture failed: No stream received, but no chrome.runtime.lastError.");
          sendResponse({ success: false, error: "TabCapture failed: No stream received." });
        }
      });
    } else {
      console.error("[MRE Background] chrome.tabCapture.capture IS NOT a function or chrome.tabCapture is undefined.");
      sendResponse({ 
        success: false, 
        error: "chrome.tabCapture.capture is not available or not a function.",
        tabCaptureObject: JSON.stringify(chrome.tabCapture) // Send what chrome.tabCapture is
      });
    }
    return true; // Indicates an asynchronous response
  }
});

console.log("[MRE Background] Service worker loaded."); 