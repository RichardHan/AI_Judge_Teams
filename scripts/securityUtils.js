/**
 * Security utilities for API key encryption and input sanitization
 * Uses Web Crypto API for encryption
 */

// Constants
const SALT = 'teams-meeting-assistant-v1';
const ITERATIONS = 100000;
const KEY_LENGTH = 256;

/**
 * Derives a cryptographic key from a password
 * @param {string} password - The password to derive from
 * @returns {Promise<CryptoKey>} The derived key
 */
async function deriveKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT),
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts data using AES-GCM
 * @param {string} data - The data to encrypt
 * @param {string} password - The password to use for encryption
 * @returns {Promise<string>} Base64 encoded encrypted data with IV
 */
async function encryptData(data, password) {
  try {
    const key = await deriveKey(password);
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      enc.encode(data)
    );
    
    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    
    // Convert to base64 for storage
    return btoa(String.fromCharCode.apply(null, combined));
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data using AES-GCM
 * @param {string} encryptedData - Base64 encoded encrypted data with IV
 * @param {string} password - The password to use for decryption
 * @returns {Promise<string>} The decrypted data
 */
async function decryptData(encryptedData, password) {
  try {
    const key = await deriveKey(password);
    
    // Convert from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
    
    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      encrypted
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Gets a unique device identifier for encryption
 * Uses a combination of user agent and timestamp
 * @returns {string} A device-specific identifier
 */
function getDeviceId() {
  // Get or create a persistent device ID
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    // Create a new device ID based on timestamp and random value
    deviceId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

/**
 * Securely stores an API key
 * @param {string} key - The storage key
 * @param {string} value - The API key to store
 * @returns {Promise<void>}
 */
async function secureSetItem(key, value) {
  if (!value) {
    localStorage.removeItem(key + '_encrypted');
    return;
  }
  
  const deviceId = getDeviceId();
  const encrypted = await encryptData(value, deviceId);
  localStorage.setItem(key + '_encrypted', encrypted);
}

/**
 * Securely retrieves an API key
 * @param {string} key - The storage key
 * @returns {Promise<string|null>} The decrypted API key or null
 */
async function secureGetItem(key) {
  const encrypted = localStorage.getItem(key + '_encrypted');
  if (!encrypted) {
    // Fallback to check if unencrypted version exists (for migration)
    const unencrypted = localStorage.getItem(key);
    if (unencrypted) {
      // Migrate to encrypted storage
      await secureSetItem(key, unencrypted);
      localStorage.removeItem(key); // Remove unencrypted version
      return unencrypted;
    }
    return null;
  }
  
  try {
    const deviceId = getDeviceId();
    return await decryptData(encrypted, deviceId);
  } catch (error) {
    console.error('Failed to decrypt stored data:', error);
    return null;
  }
}

/**
 * Sanitizes user input to prevent XSS attacks
 * @param {string} input - The input to sanitize
 * @returns {string} The sanitized input
 */
function sanitizeInput(input) {
  if (!input) return '';
  
  // Create a temporary div element
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Escapes HTML entities to prevent XSS
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
function escapeHtml(str) {
  if (!str) return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return str.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Validates an API key format
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} True if valid format
 */
function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') return false;
  
  // Trim the API key
  const trimmedKey = apiKey.trim();
  
  // Basic validation - more flexible to support various API key formats
  // Minimum length check (at least 10 characters)
  if (trimmedKey.length < 10) return false;
  
  // Allow most characters but prevent obvious issues
  // This regex allows letters, numbers, hyphens, underscores, and dots
  const validCharPattern = /^[a-zA-Z0-9_\-\.]+$/;
  
  return validCharPattern.test(trimmedKey);
}

/**
 * Validates a URL to ensure it's safe
 * @param {string} url - The URL to validate
 * @returns {boolean} True if valid URL
 */
function validateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    // Only allow HTTPS URLs for API endpoints
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    encryptData,
    decryptData,
    secureSetItem,
    secureGetItem,
    sanitizeInput,
    escapeHtml,
    validateApiKey,
    validateUrl
  };
}