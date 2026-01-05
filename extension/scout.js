/**
 * Antigravity Operator - Scout Module (The Silent Watcher)
 * 
 * This module performs silent slot availability checks by piggybacking
 * on the user's authenticated session. It mimics real browser requests
 * to avoid detection while polling the BLS API.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SCOUT_CONFIG = {
    // Base URLs for different BLS portals
    endpoints: {
        morocco: {
            base: 'https://www.blsspainmorocco.net',
            slots: '/MAR/appointment/GetAvailableSlotsByDate',
            dates: '/MAR/appointment/GetAvailableDays',
            check: '/MAR/appointment/CheckAvailability'
        },
        portugal: {
            base: 'https://www.blsportugal.com',
            slots: '/PRT/appointment/GetAvailableSlotsByDate',
            dates: '/PRT/appointment/GetAvailableDays',
            check: '/PRT/appointment/CheckAvailability'
        }
    },

    // Rate limiting configuration
    rateLimit: {
        minInterval: 10000,       // 10 seconds minimum between requests
        maxJitter: 5000,          // Random delay up to 5 seconds
        cooldownDuration: 60000,  // 60 seconds cooldown on 429
        maxRetries: 3,            // Max retries on transient errors
        backoffMultiplier: 2      // Exponential backoff multiplier
    },

    // Status codes
    status: {
        FOUND: 'FOUND',
        EMPTY: 'EMPTY',
        COOLDOWN: 'COOLDOWN',
        ERROR: 'ERROR',
        STOPPED: 'STOPPED',
        POLLING: 'POLLING'
    }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

/**
 * Scout state object tracking the current polling status
 */
const scoutState = {
    isPolling: false,
    isPaused: false,
    lastCheck: null,
    nextCheck: null,
    cooldownUntil: null,
    consecutiveErrors: 0,
    totalChecks: 0,
    slotsFound: 0,
    currentDataParam: null,
    pollInterval: null
};

/**
 * Reference to the active session from background.js
 * This will be populated via message passing
 */
let activeSession = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a random delay with jitter for human-like behavior.
 * 
 * @returns {number} Delay in milliseconds
 */
function getRandomDelay() {
    const { minInterval, maxJitter } = SCOUT_CONFIG.rateLimit;
    return minInterval + Math.floor(Math.random() * maxJitter);
}

/**
 * Sleeps for the specified duration.
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detects which BLS portal we're working with based on URL or dataParam.
 * 
 * @param {string} dataParam - The data parameter from the page
 * @returns {Object} Endpoint configuration
 */
function detectPortal(dataParam) {
    // Default to Morocco, can be extended based on dataParam patterns
    if (dataParam?.includes('PRT') || dataParam?.includes('portugal')) {
        return SCOUT_CONFIG.endpoints.portugal;
    }
    return SCOUT_CONFIG.endpoints.morocco;
}

/**
 * Builds request headers mimicking a real jQuery AJAX call.
 * 
 * @returns {Object} Headers object
 */
function buildRequestHeaders() {
    const headers = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,ar;q=0.7',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    // Inject headers from active session if available
    if (activeSession?.headers) {
        if (activeSession.headers['User-Agent']) {
            headers['User-Agent'] = activeSession.headers['User-Agent'];
        }
        // Copy any additional captured headers
        Object.keys(activeSession.headers).forEach(key => {
            if (!headers[key] && activeSession.headers[key]) {
                headers[key] = activeSession.headers[key];
            }
        });
    }

    return headers;
}

/**
 * Fetches the current active session from background.js.
 * 
 * @returns {Promise<Object>} Active session object
 */
async function fetchActiveSession() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_SESSION' }, response => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            if (response?.success) {
                activeSession = response.session;
                resolve(activeSession);
            } else {
                reject(new Error('Failed to fetch active session'));
            }
        });
    });
}

// ============================================================================
// CORE SCOUT FUNCTIONS
// ============================================================================

/**
 * Performs a silent slot availability check.
 * Uses the authenticated session to make API requests.
 * 
 * @param {string} dataParam - The data parameter (appointment category, visa type, etc.)
 * @param {string} date - Optional specific date to check (YYYY-MM-DD)
 * @returns {Promise<Object>} Result object with status and data
 */
async function checkSlotsSilent(dataParam, date = null) {
    // Check if we're in cooldown
    if (scoutState.cooldownUntil && Date.now() < scoutState.cooldownUntil) {
        const remainingCooldown = Math.ceil((scoutState.cooldownUntil - Date.now()) / 1000);
        console.log(`[Scout] In cooldown, ${remainingCooldown}s remaining`);
        return {
            status: SCOUT_CONFIG.status.COOLDOWN,
            remainingSeconds: remainingCooldown
        };
    }

    // Refresh active session before each check
    try {
        await fetchActiveSession();
    } catch (error) {
        console.warn('[Scout] Could not refresh session:', error.message);
    }

    if (!activeSession?.isAuthenticated) {
        console.warn('[Scout] No authenticated session available');
        return {
            status: SCOUT_CONFIG.status.ERROR,
            error: 'Not authenticated'
        };
    }

    const portal = detectPortal(dataParam);
    const url = `${portal.base}${portal.slots}`;

    // Build the request body
    const body = new URLSearchParams();
    body.append('AppointmentCategoryId', dataParam);
    if (date) {
        body.append('selectedDate', date);
    }

    // Add timestamp to prevent caching
    body.append('_', Date.now().toString());

    const headers = buildRequestHeaders();

    console.log(`[Scout] Checking slots at ${url}`);
    scoutState.lastCheck = Date.now();
    scoutState.totalChecks++;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: body.toString(),
            credentials: 'include', // CRITICAL: Include cookies
            mode: 'cors',
            cache: 'no-store'
        });

        // Handle 429 Too Many Requests - TRIGGER PROXY ROTATION
        if (response.status === 429) {
            console.warn('[Scout] Rate limited (429), triggering proxy rotation...');
            scoutState.consecutiveErrors++;

            // Try to rotate proxy for faster recovery
            try {
                const rotationResult = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({ type: 'HANDLE_RATE_LIMIT' }, resolve);
                });

                if (rotationResult?.action === 'RESUME') {
                    console.log('[Scout] 🔄 Proxy rotated, resuming immediately');
                    // Clear cooldown - we have a fresh proxy
                    scoutState.cooldownUntil = null;
                    scoutState.consecutiveErrors = 0;

                    return {
                        status: SCOUT_CONFIG.status.COOLDOWN,
                        remainingSeconds: 2, // Short delay after rotation
                        proxyRotated: true
                    };
                }
            } catch (error) {
                console.warn('[Scout] Proxy rotation failed:', error.message);
            }

            // Fallback to standard cooldown if rotation fails
            scoutState.cooldownUntil = Date.now() + SCOUT_CONFIG.rateLimit.cooldownDuration;

            return {
                status: SCOUT_CONFIG.status.COOLDOWN,
                remainingSeconds: SCOUT_CONFIG.rateLimit.cooldownDuration / 1000,
                proxyRotated: false
            };
        }

        // Handle other error status codes
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse response
        const data = await response.json();
        scoutState.consecutiveErrors = 0;

        // Check if slots were found
        if (data && (Array.isArray(data) ? data.length > 0 : data.slots?.length > 0)) {
            const slots = Array.isArray(data) ? data : data.slots;
            scoutState.slotsFound++;

            console.log(`[Scout] 🎯 SLOTS FOUND! Count: ${slots.length}`);

            // Notify background of found slots
            chrome.runtime.sendMessage({
                type: 'SLOTS_FOUND',
                payload: { slots, dataParam, timestamp: Date.now() }
            });

            return {
                status: SCOUT_CONFIG.status.FOUND,
                slots,
                count: slots.length
            };
        }

        console.log('[Scout] No slots available');
        return {
            status: SCOUT_CONFIG.status.EMPTY,
            message: 'No slots available'
        };

    } catch (error) {
        scoutState.consecutiveErrors++;
        console.error('[Scout] Check failed:', error.message);

        // Exponential backoff on consecutive errors
        if (scoutState.consecutiveErrors >= SCOUT_CONFIG.rateLimit.maxRetries) {
            const backoffTime = SCOUT_CONFIG.rateLimit.cooldownDuration *
                Math.pow(SCOUT_CONFIG.rateLimit.backoffMultiplier, scoutState.consecutiveErrors - SCOUT_CONFIG.rateLimit.maxRetries);
            scoutState.cooldownUntil = Date.now() + Math.min(backoffTime, 300000); // Max 5 min
        }

        return {
            status: SCOUT_CONFIG.status.ERROR,
            error: error.message,
            consecutiveErrors: scoutState.consecutiveErrors
        };
    }
}

/**
 * Checks for available dates (alternative endpoint).
 * Some BLS portals require checking available dates before slots.
 * 
 * @param {string} dataParam - The data parameter
 * @returns {Promise<Object>} Result with available dates
 */
async function checkAvailableDates(dataParam) {
    const portal = detectPortal(dataParam);
    const url = `${portal.base}${portal.dates}`;

    const headers = buildRequestHeaders();

    const body = new URLSearchParams();
    body.append('AppointmentCategoryId', dataParam);
    body.append('_', Date.now().toString());

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: body.toString(),
            credentials: 'include',
            mode: 'cors',
            cache: 'no-store'
        });

        if (response.status === 429) {
            scoutState.cooldownUntil = Date.now() + SCOUT_CONFIG.rateLimit.cooldownDuration;
            return { status: SCOUT_CONFIG.status.COOLDOWN };
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const dates = Array.isArray(data) ? data : data.dates || [];

        return {
            status: dates.length > 0 ? SCOUT_CONFIG.status.FOUND : SCOUT_CONFIG.status.EMPTY,
            dates
        };

    } catch (error) {
        return {
            status: SCOUT_CONFIG.status.ERROR,
            error: error.message
        };
    }
}

// ============================================================================
// POLLING CONTROL
// ============================================================================

/**
 * Starts the Scout polling loop.
 * 
 * @param {string} dataParam - The data parameter to poll with
 * @param {Object} options - Optional configuration overrides
 * @returns {Promise<Object>} Initial check result
 */
async function startScout(dataParam, options = {}) {
    if (scoutState.isPolling) {
        console.warn('[Scout] Already polling, stopping previous instance');
        stopScout();
    }

    console.log('[Scout] 🚀 Starting Scout with dataParam:', dataParam);

    scoutState.isPolling = true;
    scoutState.isPaused = false;
    scoutState.currentDataParam = dataParam;
    scoutState.consecutiveErrors = 0;
    scoutState.cooldownUntil = null;

    // Perform initial check
    const initialResult = await checkSlotsSilent(dataParam);

    // If slots found immediately, don't start polling
    if (initialResult.status === SCOUT_CONFIG.status.FOUND) {
        scoutState.isPolling = false;
        return initialResult;
    }

    // Start polling loop
    pollLoop(dataParam, options);

    return {
        status: SCOUT_CONFIG.status.POLLING,
        message: 'Scout started',
        initialResult
    };
}

/**
 * Internal polling loop with proper rate limiting and jitter.
 * 
 * @param {string} dataParam - The data parameter
 * @param {Object} options - Configuration options
 */
async function pollLoop(dataParam, options = {}) {
    while (scoutState.isPolling && !scoutState.isPaused) {
        // Calculate next check time with jitter
        const delay = getRandomDelay();
        scoutState.nextCheck = Date.now() + delay;

        console.log(`[Scout] Next check in ${Math.round(delay / 1000)}s`);

        // Wait for the delay
        await sleep(delay);

        // Check if we've been stopped during the wait
        if (!scoutState.isPolling) {
            console.log('[Scout] Polling stopped during wait');
            break;
        }

        // Check if in cooldown
        if (scoutState.cooldownUntil && Date.now() < scoutState.cooldownUntil) {
            const cooldownRemaining = scoutState.cooldownUntil - Date.now();
            console.log(`[Scout] In cooldown, waiting ${Math.round(cooldownRemaining / 1000)}s`);
            await sleep(cooldownRemaining);
            scoutState.cooldownUntil = null;
            continue;
        }

        // Perform the check
        const result = await checkSlotsSilent(dataParam);

        // If slots found, stop polling
        if (result.status === SCOUT_CONFIG.status.FOUND) {
            console.log('[Scout] 🎯 Slots found, stopping poll loop');
            scoutState.isPolling = false;

            // Broadcast found event
            broadcastResult(result);
            break;
        }

        // Handle cooldown status
        if (result.status === SCOUT_CONFIG.status.COOLDOWN) {
            // Will be handled in next iteration
            continue;
        }
    }

    console.log('[Scout] Poll loop ended');
}

/**
 * Stops the Scout polling.
 * 
 * @returns {Object} Final state
 */
function stopScout() {
    console.log('[Scout] 🛑 Stopping Scout');

    scoutState.isPolling = false;
    scoutState.isPaused = false;

    if (scoutState.pollInterval) {
        clearInterval(scoutState.pollInterval);
        scoutState.pollInterval = null;
    }

    return {
        status: SCOUT_CONFIG.status.STOPPED,
        totalChecks: scoutState.totalChecks,
        slotsFound: scoutState.slotsFound
    };
}

/**
 * Pauses the Scout polling temporarily.
 */
function pauseScout() {
    scoutState.isPaused = true;
    console.log('[Scout] ⏸️ Scout paused');
}

/**
 * Resumes the Scout polling.
 */
function resumeScout() {
    if (scoutState.isPolling && scoutState.isPaused) {
        scoutState.isPaused = false;
        console.log('[Scout] ▶️ Scout resumed');
        pollLoop(scoutState.currentDataParam);
    }
}

/**
 * Gets the current Scout status.
 * 
 * @returns {Object} Current state
 */
function getScoutStatus() {
    return {
        isPolling: scoutState.isPolling,
        isPaused: scoutState.isPaused,
        lastCheck: scoutState.lastCheck,
        nextCheck: scoutState.nextCheck,
        cooldownUntil: scoutState.cooldownUntil,
        inCooldown: scoutState.cooldownUntil && Date.now() < scoutState.cooldownUntil,
        totalChecks: scoutState.totalChecks,
        slotsFound: scoutState.slotsFound,
        consecutiveErrors: scoutState.consecutiveErrors,
        currentDataParam: scoutState.currentDataParam
    };
}

// ============================================================================
// EVENT BROADCASTING
// ============================================================================

/**
 * Broadcasts result to other extension components.
 * 
 * @param {Object} result - The result to broadcast
 */
function broadcastResult(result) {
    chrome.runtime.sendMessage({
        type: 'SCOUT_RESULT',
        payload: result
    }).catch(() => {
        // Ignore if no listeners
    });
}

// ============================================================================
// MESSAGE HANDLER (for integration with background.js)
// ============================================================================

/**
 * Listen for messages from other extension components.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;

    switch (type) {
        case 'START_SCOUT':
            startScout(payload?.dataParam, payload?.options)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ status: 'ERROR', error: error.message }));
            return true; // Keep channel open for async

        case 'STOP_SCOUT':
            sendResponse(stopScout());
            break;

        case 'PAUSE_SCOUT':
            pauseScout();
            sendResponse({ success: true });
            break;

        case 'RESUME_SCOUT':
            resumeScout();
            sendResponse({ success: true });
            break;

        case 'SCOUT_STATUS':
            sendResponse(getScoutStatus());
            break;

        case 'CHECK_SLOTS_ONCE':
            checkSlotsSilent(payload?.dataParam, payload?.date)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ status: 'ERROR', error: error.message }));
            return true;

        case 'CHECK_DATES':
            checkAvailableDates(payload?.dataParam)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ status: 'ERROR', error: error.message }));
            return true;
    }

    return false;
});

// ============================================================================
// EXPORTS (for module usage)
// ============================================================================

// For ES module environments
if (typeof globalThis !== 'undefined') {
    globalThis.AntigravityScout = {
        startScout,
        stopScout,
        pauseScout,
        resumeScout,
        checkSlotsSilent,
        checkAvailableDates,
        getScoutStatus,
        SCOUT_CONFIG
    };
}

console.log('[Scout] Module loaded and ready');
