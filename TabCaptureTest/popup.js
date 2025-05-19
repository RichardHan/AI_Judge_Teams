document.addEventListener('DOMContentLoaded', () => {
  const testButton = document.getElementById('testButton');
  const statusDiv = document.getElementById('status');

  testButton.addEventListener('click', () => {
    statusDiv.textContent = 'Testing...';
    chrome.runtime.sendMessage({ action: "testTabCapture" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[MRE Popup] Error sending message:", chrome.runtime.lastError.message);
        statusDiv.textContent = `Error: ${chrome.runtime.lastError.message}`;
        return;
      }
      if (response) {
        console.log("[MRE Popup] Response received:", response);
        if (response.success) {
          statusDiv.textContent = `Success: ${response.message}`;
        } else {
          statusDiv.textContent = `Failed: ${response.error}`;
          if(response.tabCaptureObject) {
            statusDiv.textContent += ` (chrome.tabCapture was: ${response.tabCaptureObject})`;
          }
        }
      } else {
        statusDiv.textContent = 'No response from background script.';
        console.log("[MRE Popup] No response received from background script.");
      }
    });
  });
}); 