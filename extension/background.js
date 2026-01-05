/**
 * Antigravity Operator - Background Service Worker (The General)
 * 
 * This service worker acts as the central command center for the Hive system.
 * It captures and stores session data from content scripts, feeding The Scout
 * with the necessary cookies and headers for silent slot checking.
 */

// ============================================================================
// MODULE IMPORTS
// ============================================================================

// Import all Antigravity modules
// - Scout: Silent slot watcher
// - Sniper: Instant booking executor  
// - ProxyManager: Proxy rotation and session clearing
// - StealthManager: Fingerprint spoofing and user-agent rotation
// - SocketClient: WebSocket connection to Orchestrator server
// - CaptchaService: External CAPTCHA solving APIs
import { CaptchaService } from './captcha_service.js';
import { ProxyManager } from './proxy_manager.js';
import { StealthManager } from './stealth.js';

// Load other modules for side-effects (attaching to globalThis)
import './scout.js';
import './sniper.js';
import './socket_client.js';

// ============================================================================
// CRITICAL: CLEAR PROXY IMMEDIATELY ON SERVICE WORKER LOAD
// This runs every time the service worker loads (including extension reload)
// ============================================================================
(async () => {
  try {
    console.log('[Antigravity] 🚫 CLEARING PROXY ON LOAD (Direct Connection)...');
    await ProxyManager.clear();
    console.log('[Antigravity] ✅ Proxy cleared - using direct connection');
    console.log('[Antigravity] ✅ Proxy cleared - using direct connection');
  } catch (e) {
    console.warn('[Antigravity] Could not clear proxy:', e);
  }

  // FORCE CLEAR DNR RULES (Zombie Rule Fix)
  try {
    console.log('[Antigravity] 🧹 Clearing all dynamic rules...');
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIds = rules.map(rule => rule.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds
    });
    console.log('[Antigravity] ✅ All dynamic rules cleared.');
  } catch (e) {
    console.warn('[Antigravity] Failed to clear rules:', e);
  }
})();

// Initialize Stealth on startup (AFTER proxy/rule clear)
StealthManager.init().catch(err => console.warn('[Antigravity] Stealth init failed:', err));

// ============================================================================
// PROXY AUTHENTICATION HANDLER (CRITICAL FOR AUTHENTICATED PROXIES)
// ============================================================================

/**
 * Handle proxy authentication requests.
 * When a proxy requires user/pass, Chrome fires onAuthRequired.
 * We respond with the stored credentials.
 */
chrome.webRequest.onAuthRequired.addListener(
  async (details) => {
    console.log('[Antigravity] 🔐 Proxy auth required for:', details.challenger?.host);

    try {
      const data = await chrome.storage.session.get('proxyAuth');
      if (data.proxyAuth) {
        console.log('[Antigravity] 🔑 Providing proxy credentials...');
        return { authCredentials: data.proxyAuth };
      }
    } catch (e) {
      console.error('[Antigravity] Failed to get proxy auth:', e);
    }

    return {}; // No credentials available
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"] // Manifest V3 requires asyncBlocking instead of blocking
);

// ============================================================================
// AUTO-SNIPER CONFIGURATION
// ============================================================================

const AUTO_SNIPER_CONFIG = {
  enabled: true,            // Auto-fire sniper when slots found
  preferredSlotIndex: 0,    // Which slot to pick (0 = first available)
  retryOnFail: true,        // Retry with next slot if first fails
  maxAutoAttempts: 3        // Max auto-sniper attempts per scout find
};

let autoSniperAttempts = 0;

// ============================================================================
// HUNTING STATE (For Popup Sync)
// ============================================================================

let isHunting = false;

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

/**
 * Active session object storing captured headers, cookies, and page state.
 * This is the primary data structure that The Scout will consume.
 */
let activeSession = {
  url: null,
  cookies: null,
  pageState: null,
  capturedAt: null,
  headers: {},
  isAuthenticated: false
};

/**
 * Session history for debugging and recovery purposes
 */
const sessionHistory = [];
const MAX_HISTORY_SIZE = 50;

// ============================================================================
// DIRECT GRID CAPTCHA SOLVER (TURBO MODE)
// ============================================================================

/**
 * Solve BLS grid captcha by calling NoCaptchaAI API directly.
 * Uses the "bls" module which returns OCR'd numbers for each cell.
 * 
 * @param {string[]} images - Array of base64 image data (may include data URI prefix)
 * @param {string} target - Target number to find (e.g., "781")
 * @param {string} apiKey - NoCaptchaAI API key
 * @returns {Promise<{success: boolean, matches?: number[], error?: string}>}
 */
async function solveGridCaptchaDirect(images, target, apiKey) {
  const CREATE_TASK_URL = 'https://api.nocaptchaai.com/createTask';
  const GET_RESULT_URL = 'https://api.nocaptchaai.com/getTaskResult';
  const MAX_POLLS = 30;  // Max 30 attempts
  const POLL_INTERVAL = 1000; // 1 second between polls

  try {
    console.log(`[Background] 🚀 BLS Module API call for target: "${target}"`);
    console.log(`[Background] 📸 Processing ${images.length} images...`);

    // CRITICAL: Strip base64 prefix if present
    const cleanImages = images.map(img => {
      if (img.startsWith('data:')) {
        return img.split(',')[1];
      }
      return img;
    });

    // Build payload following NoCaptchaAI BLS module format
    const payload = {
      clientKey: apiKey,
      task: {
        type: 'ImageToTextTask',
        module: 'bls',
        images: cleanImages,
        maxLength: 3
      }
    };

    console.log('[Background] 📤 Sending createTask request...');

    const createResponse = await fetch(CREATE_TASK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      console.error(`[Background] ❌ createTask Error ${createResponse.status}:`, errText);
      return { success: false, error: `API Error ${createResponse.status}: ${errText}` };
    }

    const createResult = await createResponse.json();
    console.log('[Background] 📦 createTask Response:', JSON.stringify(createResult, null, 2));

    // Check for immediate error
    if (createResult.errorId || createResult.error) {
      return { success: false, error: createResult.errorDescription || createResult.error };
    }

    // =====================================================================
    // ROBUST RESPONSE PARSING - Check ALL possible response formats
    // =====================================================================

    console.log('[Background] 🔍 Checking response structure...');
    console.log('[Background] Response keys:', Object.keys(createResult));
    console.log('[Background] Full response:', JSON.stringify(createResult));

    let solution = null;

    // Try to find solution in various possible locations
    if (createResult.solution && Array.isArray(createResult.solution)) {
      solution = createResult.solution;
      console.log('[Background] ✅ Found in: solution');
    } else if (createResult.answers && Array.isArray(createResult.answers)) {
      solution = createResult.answers;
      console.log('[Background] ✅ Found in: answers');
    } else if (createResult.result && Array.isArray(createResult.result)) {
      solution = createResult.result;
      console.log('[Background] ✅ Found in: result');
    } else if (createResult.data && Array.isArray(createResult.data)) {
      solution = createResult.data;
      console.log('[Background] ✅ Found in: data');
    } else if (createResult.text && Array.isArray(createResult.text)) {
      solution = createResult.text;
      console.log('[Background] ✅ Found in: text');
    } else if (Array.isArray(createResult)) {
      solution = createResult;
      console.log('[Background] ✅ Response is direct array');
    }
    // Check for nested task.solution
    else if (createResult.task && createResult.task.solution) {
      solution = createResult.task.solution;
      console.log('[Background] ✅ Found in: task.solution');
    }
    // Async task - need to poll getTaskResult
    else if (createResult.taskId) {
      console.log(`[Background] ⏳ Got taskId: ${createResult.taskId} - Starting polling...`);

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));

        const pollResponse = await fetch(GET_RESULT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: apiKey,
            taskId: createResult.taskId
          })
        });

        if (!pollResponse.ok) {
          console.warn(`[Background] ⚠️ Poll ${i + 1} failed: ${pollResponse.status}`);
          continue;
        }

        const pollResult = await pollResponse.json();
        console.log(`[Background] 📊 Poll ${i + 1}:`, JSON.stringify(pollResult));

        // Check for error
        if (pollResult.errorId || pollResult.error) {
          return { success: false, error: pollResult.errorDescription || pollResult.error };
        }

        // Check for solution in various fields
        if (pollResult.status === 'ready' || pollResult.solution || pollResult.answers) {
          solution = pollResult.solution || pollResult.answers || pollResult.result;
          console.log('[Background] ✅ Solution ready via polling!');
          break;
        }

        // Check for processing
        if (pollResult.status === 'processing') {
          console.log(`[Background] ⏳ Still processing... (${i + 1}/${MAX_POLLS})`);
        }
      }

      if (!solution) {
        return { success: false, error: 'Timeout waiting for solution' };
      }
    }

    // Still no solution found
    if (!solution) {
      console.error('[Background] ❌ Could not extract solution from response!');
      console.error('[Background] Available keys:', Object.keys(createResult).join(', '));

      // Try one more thing: maybe the response IS the solution for single images
      if (typeof createResult === 'object' && createResult.solution) {
        solution = [createResult.solution]; // Wrap single solution
      } else {
        return { success: false, error: 'Unknown API response format', rawResponse: createResult };
      }
    }

    // =====================================================================
    // PARSE SOLUTION AND FIND MATCHES
    // =====================================================================

    console.log(`[Background] 🔢 OCR Results (${solution.length} cells): [${solution.join(', ')}]`);
    console.log(`[Background] 🎯 Looking for target: "${target}"`);

    const matches = [];
    solution.forEach((val, idx) => {
      const valStr = String(val).trim();
      const targetStr = String(target).trim();

      console.log(`[Background] 📊 Cell ${idx}: "${valStr}" vs target "${targetStr}" → ${valStr === targetStr ? '✅ MATCH' : '❌'}`);

      if (valStr === targetStr) {
        matches.push(idx);
      }
    });

    console.log(`[Background] ✅ Total matches: [${matches.join(', ')}] (${matches.length} found)`);
    return { success: true, matches, solution };

  } catch (err) {
    console.error('[Background] ❌ Direct API Error:', err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

/**
 * Central message router for all extension communications.
 * Handles messages from content scripts, popup, and other extension components.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  console.log(`[Antigravity] Received message: ${type}`, payload);

  switch (type) {
    case 'PAGE_STATE':
      handlePageState(payload, sender);
      sendResponse({ success: true, sessionId: Date.now() });
      break;

    case 'GET_SESSION':
      sendResponse({ success: true, session: activeSession });
      break;

    case 'CLEAR_SESSION':
      clearSession();
      sendResponse({ success: true });
      break;

    case 'GET_COOKIES':
      getCookiesForDomain(payload?.domain)
        .then(cookies => sendResponse({ success: true, cookies }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response

    case 'INJECT_SCOUT':
      injectScoutLogic(sender.tab?.id)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    // ========================================================================
    // SCOUT & SNIPER INTEGRATION
    // ========================================================================

    case 'SLOTS_FOUND':
    case 'SCOUT_RESULT':
      if (payload?.status === 'FOUND' || payload?.slots) {
        console.log('[Antigravity] 🎯 SLOTS FOUND! Triggering auto-sniper...');
        handleSlotsFound(payload)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      }
      sendResponse({ success: true, handled: false });
      break;

    case 'SNIPER_RESULT':
      console.log('[Antigravity] Sniper result:', payload);
      handleSniperResult(payload);
      sendResponse({ success: true });
      break;

    case 'SET_AUTO_SNIPER':
      Object.assign(AUTO_SNIPER_CONFIG, payload);
      sendResponse({ success: true, config: AUTO_SNIPER_CONFIG });
      break;

    case 'GET_AUTO_SNIPER_CONFIG':
      sendResponse({ success: true, config: AUTO_SNIPER_CONFIG });
      break;

    case 'ROTATE_PROXY':
      console.log('[Antigravity] 🔄 Rotation Requested');
      sendResponse({ success: true, status: 'ROTATING' });

      (async () => {
        // A. Visual Reset: Go to blank page immediately
        // This clears the "Too Many Requests" error from the screen instantly
        const tabs = await chrome.tabs.query({ url: '*://*.blsspainmorocco.net/*' });
        let activeTabId = null;
        if (tabs.length > 0) {
          activeTabId = tabs[0].id;
          await chrome.tabs.update(activeTabId, { url: 'about:blank' });
        }

        // B. Rotate & Wipe (Behind the scenes)
        await ProxyManager.rotate();
        await chrome.browsingData.remove({ since: 0 }, {
          cache: true, cookies: true, localStorage: true,
          indexedDB: true, serviceWorkers: true, cacheStorage: true
        });
        await StealthManager.rotateIdentity();
        console.log('[Antigravity] ✨ Identity Wiped');

        // C. Navigate Back (Fresh Clean Load)
        // Wait a tiny bit for the wipe to take effect
        setTimeout(() => {
          const TARGET_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
          if (activeTabId) {
            chrome.tabs.update(activeTabId, { url: TARGET_URL });
          } else {
            chrome.tabs.create({ url: TARGET_URL });
          }
          console.log('[Antigravity] 🔄 Respawned on new IP');
        }, 500);
      })();
      return true;

    case 'CLEAR_PROXY':
      console.log('[Antigravity] 🔌 Disabling Proxy (Direct Connection)...');
      (async () => {
        await ProxyManager.clear();

        // Wipe identity even for direct connection to be safe
        await chrome.browsingData.remove({ since: 0 }, { cache: true, cookies: true, localStorage: true });

        // Reload active tab
        const tabs = await chrome.tabs.query({ url: '*://*.blsspainmorocco.net/*' });
        if (tabs.length > 0) {
          chrome.tabs.reload(tabs[0].id, { bypassCache: true });
        }
        sendResponse({ success: true });
      })();
      return true;

    case 'GET_PROXY_STATUS':
      ProxyManager.getStatus().then(status => {
        sendResponse({ success: true, status });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;

    case 'GET_STATUS':
      // Return current hunting state for popup sync
      ProxyManager.getStatus().then(proxyStatus => {
        sendResponse({
          success: true,
          isHunting: isHunting,
          proxy: proxyStatus
        });
      }).catch(() => {
        sendResponse({
          success: true,
          isHunting: isHunting,
          proxy: null
        });
      });
      return true;

    case 'CLEAR_BROWSING_DATA':
      // Clear cookies and cache for specific domain (used before proxy reload)
      console.log('[Antigravity] 🧹 Clearing browsing data for:', payload?.domain || 'all');
      (async () => {
        try {
          // Clear cookies for BLS domain
          const cookies = await chrome.cookies.getAll({ domain: '.blsspainmorocco.net' });
          for (const cookie of cookies) {
            const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            await chrome.cookies.remove({ url, name: cookie.name });
          }
          console.log(`[Antigravity] 🗑️ Cleared ${cookies.length} cookies`);

          // Clear cache using browsingData API
          await chrome.browsingData.remove({
            origins: ["https://www.blsspainmorocco.net", "https://blsspainmorocco.net"]
          }, {
            cache: true,
            cacheStorage: true
          });
          console.log('[Antigravity] 🗑️ Cleared cache for BLS domain');

          sendResponse({ success: true, cookiesCleared: cookies.length });
        } catch (error) {
          console.error('[Antigravity] Clear data error:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'PING':
      sendResponse({ success: true, active: true, timestamp: Date.now() });
      break;

    case 'SET_BOOKING_CONFIG':
      chrome.storage.local.set({ bookingConfig: payload })
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'TEST_SNIPER':
      // Test sniper with current session (no actual booking)
      console.log('[Antigravity] Testing Sniper...');
      const testResult = {
        status: activeSession?.isAuthenticated ? 'READY' : 'NOT_AUTHENTICATED',
        session: {
          isAuthenticated: activeSession?.isAuthenticated,
          pageState: activeSession?.pageState,
          hasCookies: !!activeSession?.cookies?.length
        }
      };
      sendResponse(testResult);
      break;

    // ========================================================================
    // FORM FILLER & CLIENT MANAGEMENT
    // ========================================================================

    case 'GET_ACTIVE_CLIENT':
      chrome.storage.local.get(['activeClient'], (result) => {
        if (result.activeClient) {
          sendResponse({ success: true, client: result.activeClient });
        } else {
          sendResponse({ success: false, error: 'No active client' });
        }
      });
      return true;

    case 'SET_ACTIVE_CLIENT':
      chrome.storage.local.set({ activeClient: payload })
        .then(() => {
          console.log('[Antigravity] Active client set:', payload?.firstName);
          sendResponse({ success: true });
        })
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'FORM_FILLED':
      console.log('[Antigravity] Form filled:', payload);
      // Broadcast to popup
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: `Form filled: ${payload.totalFilled} fields`, level: 'success' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    case 'LIVENESS_PAGE_DETECTED':
      console.log('[Antigravity] 👁️ Liveness page detected');
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: 'Liveness verification page detected', level: 'warning' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    case 'LIVENESS_READY':
      console.log('[Antigravity] Liveness button ready');
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: 'Liveness ready - awaiting action', level: 'info' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    case 'SOLVE_CAPTCHA':
      console.log('[Antigravity] 🧩 CAPTCHA solve request received');

      (async () => {
        try {
          // ================================================================
          // GRID CAPTCHA: Direct API Pipeline (TURBO MODE)
          // ================================================================
          if (payload?.type === 'GRID') {
            console.log('[Antigravity] 🚀 TURBO MODE: Direct Grid API');

            const { images, target, apiKey } = payload;
            if (!images || !target || !apiKey) {
              sendResponse({ success: false, error: 'Missing required fields' });
              return;
            }

            chrome.runtime.sendMessage({
              type: 'LOG_UPDATE',
              payload: { message: `🔬 Solving Grid: Target "${target}"...`, level: 'info' }
            }).catch(() => { });

            // Direct API Call to NoCaptchaAI
            const result = await solveGridCaptchaDirect(images, target, apiKey);

            if (result.success) {
              console.log('[Antigravity] ✅ Grid solved:', result.matches);
              chrome.runtime.sendMessage({
                type: 'LOG_UPDATE',
                payload: { message: `✅ Grid solved! Matches: [${result.matches.join(', ')}]`, level: 'success' }
              }).catch(() => { });
              sendResponse({ success: true, matches: result.matches, solution: result.solution });
            } else {
              console.error('[Antigravity] ❌ Grid solve failed:', result.error);
              sendResponse({ success: false, error: result.error, rawResponse: result.rawResponse });
            }
            return;
          }

          // ================================================================
          // TEXT CAPTCHA: Original CaptchaService Pipeline
          // ================================================================
          if (!CaptchaService) {
            console.error('[Antigravity] CaptchaService not loaded');
            sendResponse({ success: false, solution: null, error: 'SERVICE_NOT_LOADED' });
            return;
          }

          chrome.runtime.sendMessage({
            type: 'LOG_UPDATE',
            payload: { message: '🧩 Solving Text CAPTCHA...', level: 'info' }
          }).catch(() => { });

          const result = await CaptchaService.solveCaptcha(payload.image);

          if (result.success && result.solution) {
            console.log('[Antigravity] ✅ CAPTCHA solved:', result.solution);
            if (sender?.tab?.id) {
              chrome.tabs.sendMessage(sender.tab.id, {
                type: 'CAPTCHA_SOLVED',
                payload: { solution: result.solution }
              }).catch(() => { });
            }
            sendResponse({ success: true, solution: result.solution });
          } else {
            console.error('[Antigravity] ❌ CAPTCHA solve failed:', result.error);
            sendResponse({ success: false, solution: null, error: result.error });
          }
        } catch (error) {
          console.error('[Antigravity] CAPTCHA error:', error);
          sendResponse({ success: false, solution: null, error: error.message });
        }
      })();
      return true;

    case 'LOGIN_ATTEMPTED':
      console.log(`[Antigravity] 🔐 Login attempted for: ${payload?.email} (attempt ${payload?.attempt})`);
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: `🔐 Login submitted for ${payload?.email}`, level: 'info' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    case 'START_HUNTING':
      console.log('[Antigravity] 🚀 Launching mission...');
      isHunting = true; // Update hunting state
      (async () => {
        try {
          const TARGET_URL = 'https://www.blsspainmorocco.net/MAR/account/login';
          const tabs = await chrome.tabs.query({ url: '*://*.blsspainmorocco.net/*' });

          if (tabs.length > 0) {
            console.log('[Antigravity] Updating existing tab:', tabs[0].id);
            await chrome.tabs.update(tabs[0].id, { url: TARGET_URL, active: true });
          } else {
            console.log('[Antigravity] Opening new tab');
            await chrome.tabs.create({ url: TARGET_URL });
          }
          sendResponse({ success: true });
        } catch (error) {
          console.error('[Antigravity] Launch failed:', error);
          isHunting = false; // Reset on failure
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case 'STOP_MISSION':
      console.log('[Antigravity] 🛑 Stopping mission...');
      isHunting = false;
      sendResponse({ success: true });
      break;

    case 'TEST_TELEGRAM':
      console.log('[Antigravity] 📨 Testing Telegram notification...');
      (async () => {
        try {
          const { botToken, chatId } = payload;
          const message = `🧪 *Antigravity Test*\n\n✅ Connection successful!\n⏰ Time: ${new Date().toLocaleString()}`;

          const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: message,
              parse_mode: 'Markdown'
            })
          });

          const result = await response.json();

          if (result.ok) {
            console.log('[Antigravity] ✅ Telegram test successful');
            sendResponse({ success: true });
          } else {
            console.error('[Antigravity] ❌ Telegram error:', result.description);
            sendResponse({ success: false, error: result.description });
          }
        } catch (error) {
          console.error('[Antigravity] ❌ Telegram fetch error:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep channel open for async response

    case 'LIVENESS_COMPLETE':
      console.log('[Antigravity] ✅ Liveness verification complete');
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: '✅ Liveness completed!', level: 'success' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    case 'PAYMENT_PAGE_DETECTED':
      console.log('[Antigravity] 💳 Payment page detected');
      chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: { message: '💳 Payment page reached!', level: 'success' }
      }).catch(() => { });
      sendResponse({ success: true });
      break;

    default:
      console.warn(`[Antigravity] Unknown message type: ${type}`);
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return false;
});

// ============================================================================
// SESSION MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Handles PAGE_STATE messages from content scripts.
 * Stores the captured session data and determines authentication status.
 * 
 * @param {Object} payload - The page state data from content script
 * @param {Object} sender - Chrome sender object with tab info
 */
async function handlePageState(payload, sender) {
  const { url, cookies, pageState, domData } = payload;

  // Capture cookies directly from the browser for accuracy
  let capturedCookies = cookies;
  try {
    if (sender.tab?.url) {
      const domain = new URL(sender.tab.url).hostname;
      capturedCookies = await getCookiesForDomain(domain);
    }
  } catch (error) {
    console.error('[Antigravity] Failed to capture cookies:', error);
  }

  // Update active session
  activeSession = {
    url: url || sender.tab?.url,
    cookies: capturedCookies,
    pageState: pageState,
    capturedAt: Date.now(),
    headers: payload.headers || {},
    isAuthenticated: determineAuthStatus(pageState, capturedCookies),
    tabId: sender.tab?.id,
    domData: domData
  };

  // Store in session history
  addToHistory(activeSession);

  // Persist to storage for recovery
  await chrome.storage.local.set({
    activeSession,
    lastUpdate: Date.now()
  });

  console.log('[Antigravity] Session updated:', {
    pageState: activeSession.pageState,
    isAuthenticated: activeSession.isAuthenticated,
    cookieCount: capturedCookies?.length || 0
  });

  // Broadcast session update to any listeners (popup, scout)
  chrome.runtime.sendMessage({
    type: 'SESSION_UPDATED',
    payload: {
      pageState: activeSession.pageState,
      isAuthenticated: activeSession.isAuthenticated
    }
  }).catch(() => {
    // Ignore errors if no listeners
  });
}

/**
 * Determines if the user is authenticated based on page state and cookies.
 * 
 * @param {string} pageState - Current page state identifier
 * @param {Array} cookies - Array of captured cookies
 * @returns {boolean} - True if user appears to be authenticated
 */
function determineAuthStatus(pageState, cookies) {
  // If on appointment or calendar page, user is definitely authenticated
  if (pageState === 'APPOINTMENT' || pageState === 'CALENDAR') {
    return true;
  }

  // Check for authentication cookies
  const authCookieNames = ['ASP.NET_SessionId', '.AspNetCore.Cookies', 'auth_token', 'session'];
  const hasAuthCookie = cookies?.some(cookie =>
    authCookieNames.some(name => cookie.name.toLowerCase().includes(name.toLowerCase()))
  );

  return hasAuthCookie;
}

/**
 * Clears the active session data.
 */
function clearSession() {
  activeSession = {
    url: null,
    cookies: null,
    pageState: null,
    capturedAt: null,
    headers: {},
    isAuthenticated: false
  };

  chrome.storage.local.remove(['activeSession', 'lastUpdate']);
  console.log('[Antigravity] Session cleared');
}

/**
 * Adds a session snapshot to history for debugging.
 * 
 * @param {Object} session - Session object to store
 */
function addToHistory(session) {
  sessionHistory.unshift({
    ...session,
    cookies: session.cookies?.length || 0 // Don't store actual cookie values in history
  });

  if (sessionHistory.length > MAX_HISTORY_SIZE) {
    sessionHistory.pop();
  }
}

// ============================================================================
// COOKIE MANAGEMENT
// ============================================================================

/**
 * Retrieves all cookies for a given domain.
 * 
 * @param {string} domain - The domain to get cookies for
 * @returns {Promise<Array>} - Array of cookie objects
 */
async function getCookiesForDomain(domain) {
  if (!domain) {
    // Get cookies for all BLS domains
    const blsDomains = ['blsspainmorocco.net', 'blsportugal.com'];
    const allCookies = [];

    for (const d of blsDomains) {
      try {
        const cookies = await chrome.cookies.getAll({ domain: d });
        allCookies.push(...cookies);
      } catch (error) {
        console.warn(`[Antigravity] Failed to get cookies for ${d}:`, error);
      }
    }

    return allCookies;
  }

  return chrome.cookies.getAll({ domain });
}

/**
 * Sets a cookie for the Scout to use.
 * 
 * @param {Object} cookieData - Cookie data object
 * @returns {Promise<Object>} - The set cookie
 */
async function setCookie(cookieData) {
  return chrome.cookies.set(cookieData);
}

// ============================================================================
// SCOUT INTEGRATION
// ============================================================================

/**
 * Injects Scout logic into a specific tab.
 * This allows The Scout to piggyback on the authenticated session.
 * 
 * @param {number} tabId - The tab ID to inject into
 */
async function injectScoutLogic(tabId) {
  if (!tabId) {
    throw new Error('No tab ID provided for Scout injection');
  }

  // Inject the scout logic into the page
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Scout injection point - will be expanded in Phase 2
      window.__ANTIGRAVITY_SCOUT_ACTIVE__ = true;
      console.log('[Antigravity Scout] Injected and ready');
    }
  });
}

// ============================================================================
// LIFECYCLE EVENTS
// ============================================================================

/**
 * Service worker installation handler.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Antigravity] Extension installed:', details.reason);

  // CRITICAL: Clear any stale proxy settings to prevent blocking
  // This ensures fresh install starts with direct connection
  try {
    await ProxyManager.clear();
    console.log('[Antigravity] ✅ Proxy cleared on install (direct connection)');
  } catch (e) {
    console.warn('[Antigravity] Could not clear proxy on install:', e);
  }

  // Initialize storage with default values
  chrome.storage.local.set({
    installed: Date.now(),
    version: chrome.runtime.getManifest().version,
    config: {
      autoCapture: true,
      debugMode: false
    }
  });
});

/**
 * Service worker startup handler.
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Antigravity] Service worker started');

  // CRITICAL: Clear proxy on startup to prevent stale proxy blocking
  // User must explicitly enable proxy via popup
  try {
    await ProxyManager.clear();
    console.log('[Antigravity] ✅ Proxy cleared on startup (direct connection)');
  } catch (e) {
    console.warn('[Antigravity] Could not clear proxy on startup:', e);
  }

  // Recover session from storage if available
  chrome.storage.local.get(['activeSession'], (result) => {
    if (result.activeSession) {
      activeSession = result.activeSession;
      console.log('[Antigravity] Session recovered from storage');
    }
  });
});

/**
 * Tab update listener to track navigation within BLS domains.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isBLSDomain = tab.url.includes('blsspainmorocco.net') ||
      tab.url.includes('blsportugal.com');

    if (isBLSDomain) {
      console.log('[Antigravity] BLS domain detected, tab:', tabId);
    }
  }
});

// ============================================================================
// AUTO-SNIPER INTEGRATION
// ============================================================================

/**
 * Handles slots found event from Scout.
 * Automatically triggers Sniper if auto-sniper is enabled.
 * 
 * @param {Object} payload - The slots found payload
 * @returns {Promise<Object>} Result of the sniper execution
 */
async function handleSlotsFound(payload) {
  const slots = payload.slots || [];

  if (!slots.length) {
    console.log('[Antigravity] No slots in payload');
    return { success: false, reason: 'No slots available' };
  }

  // Check if auto-sniper is enabled
  if (!AUTO_SNIPER_CONFIG.enabled) {
    console.log('[Antigravity] Auto-sniper disabled, waiting for manual trigger');

    // Broadcast to popup for manual action
    chrome.runtime.sendMessage({
      type: 'SLOTS_AVAILABLE',
      payload: { slots, count: slots.length }
    }).catch(() => { });

    return { success: true, autoSniper: false, slotsCount: slots.length };
  }

  // Check attempt limit
  if (autoSniperAttempts >= AUTO_SNIPER_CONFIG.maxAutoAttempts) {
    console.warn('[Antigravity] Max auto-sniper attempts reached');
    autoSniperAttempts = 0; // Reset for next round
    return { success: false, reason: 'Max attempts reached' };
  }

  // Select the best slot
  const selectedSlot = selectBestSlot(slots);

  if (!selectedSlot) {
    console.error('[Antigravity] Could not select a slot');
    return { success: false, reason: 'No valid slot to select' };
  }

  console.log('[Antigravity] 🔫 Auto-sniper targeting slot:', selectedSlot);
  autoSniperAttempts++;

  // Fire the Sniper!
  try {
    const result = await globalThis.AntigravitySniper.executeSniperWithRetry(
      selectedSlot,
      activeSession
    );

    if (result.status === 'BOOKED') {
      console.log('[Antigravity] ✅ BOOKING SUCCESSFUL!');
      autoSniperAttempts = 0;

      // Play notification sound or show alert
      notifyBookingSuccess(selectedSlot, result);
    } else if (result.status === 'FAILED' && AUTO_SNIPER_CONFIG.retryOnFail) {
      // Try next slot if available
      const remainingSlots = slots.filter(s => s.slotId !== selectedSlot.slotId);
      if (remainingSlots.length > 0) {
        console.log('[Antigravity] Trying next slot...');
        return handleSlotsFound({ slots: remainingSlots });
      }
    }

    return { success: true, result };

  } catch (error) {
    console.error('[Antigravity] Sniper execution failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Selects the best slot from available slots.
 * 
 * @param {Array} slots - Available slots
 * @returns {Object|null} Selected slot data
 */
function selectBestSlot(slots) {
  if (!slots || slots.length === 0) return null;

  // Sort by time (earlier is better) if times are available
  const sortedSlots = [...slots].sort((a, b) => {
    if (a.time && b.time) {
      return a.time.localeCompare(b.time);
    }
    return 0;
  });

  // Get preferred slot or first available
  const index = Math.min(
    AUTO_SNIPER_CONFIG.preferredSlotIndex,
    sortedSlots.length - 1
  );

  const slot = sortedSlots[index];

  // Normalize slot data structure
  return {
    date: slot.date || slot.AppointmentDate || slot.appointmentDate,
    slotId: slot.slotId || slot.SlotId || slot.AppointmentSlotId || slot.id,
    time: slot.time || slot.AppointmentTime || slot.appointmentTime || slot.Time
  };
}

/**
 * Handles Sniper result for logging and notifications.
 * 
 * @param {Object} payload - Sniper result payload
 */
function handleSniperResult(payload) {
  const { status, slotData, timestamp } = payload;

  // Store result history
  chrome.storage.local.get(['sniperHistory'], (result) => {
    const history = result.sniperHistory || [];
    history.unshift({
      status,
      slotData,
      timestamp,
      success: status === 'BOOKED'
    });

    // Keep only last 50 results
    chrome.storage.local.set({
      sniperHistory: history.slice(0, 50)
    });
  });

  if (status === 'BOOKED') {
    notifyBookingSuccess(slotData, payload);
  }
}

/**
 * Notifies the user of a successful booking.
 * 
 * @param {Object} slotData - The booked slot data
 * @param {Object} result - The booking result
 */
function notifyBookingSuccess(slotData, result) {
  // Create browser notification
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '🎉 Appointment Booked!',
    message: `Successfully booked for ${slotData.date} at ${slotData.time}`,
    priority: 2,
    requireInteraction: true
  }).catch(() => {
    console.log('[Antigravity] Notification API not available');
  });

  // Also broadcast to any open popups
  chrome.runtime.sendMessage({
    type: 'BOOKING_SUCCESS',
    payload: { slotData, result }
  }).catch(() => { });
}

console.log('[Antigravity] Background service worker initialized');

