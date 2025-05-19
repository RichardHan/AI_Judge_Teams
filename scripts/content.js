// Content script runs in the Teams page
console.log('Teams Meeting Recording & Transcription Assistant content script loaded');

// Listen for specific element changes on the Teams page
function observeTeamsElements() {
  // Create an observer instance
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // Detect if screen sharing is started
      const sharingIndicators = document.querySelectorAll('[data-tid="calling-share-tray-button"]');
      if (sharingIndicators.length > 0) {
        // Notify background script of screen sharing activity
        chrome.runtime.sendMessage({
          action: 'teamsScreenShareDetected'
        });
      }
      
      // Detect participant name changes
      const participantsList = document.querySelectorAll('[data-tid="roster-person"]');
      if (participantsList.length > 0) {
        const participants = Array.from(participantsList).map(el => el.textContent.trim());
        chrome.runtime.sendMessage({
          action: 'teamsParticipantsUpdated',
          participants
        });
      }
    });
  });
  
  // Start observing the document
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Observe after the page is fully loaded
window.addEventListener('load', () => {
  // Check if on Teams web page
  if (window.location.href.includes('teams.microsoft.com')) {
    observeTeamsElements();
  }
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  switch (message.action) {
    case 'getTeamsMeetingInfo':
      // Get meeting info
      const meetingInfo = extractMeetingInfo();
      sendResponse({ success: true, meetingInfo });
      break;
      
    case 'checkTeamsStatus':
      const isTeamsMeeting = document.querySelectorAll('[data-tid="call-composite"]').length > 0;
      sendResponse({ isTeamsMeeting });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Extract meeting info from Teams page
function extractMeetingInfo() {
  // Try to get meeting title
  let meetingTitle = '';
  const titleElement = document.querySelector('[data-tid="calling-header-text"]');
  if (titleElement) {
    meetingTitle = titleElement.textContent.trim();
  } else {
    // Try other ways to get meeting title
    const headingElements = document.querySelectorAll('h1, h2, h3');
    for (const heading of headingElements) {
      if (heading.textContent.includes('Meeting')) {
        meetingTitle = heading.textContent.trim();
        break;
      }
    }
  }
  
  // Try to get participant count
  let participantCount = 0;
  const participantElements = document.querySelectorAll('[data-tid="roster-participant"]');
  if (participantElements.length > 0) {
    participantCount = participantElements.length;
  }
  
  // Get current time as meeting start time
  const meetingTime = new Date().toISOString();
  
  return {
    title: meetingTitle || 'Untitled Meeting',
    participants: participantCount,
    time: meetingTime
  };
}