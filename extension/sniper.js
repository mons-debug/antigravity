/**
 * Antigravity Operator - Sniper Module (The Ghost Shot)
 * 
 * This module executes instant booking requests without UI rendering.
 * When slots are found by the Scout, the Sniper fires immediately.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SNIPER_CONFIG = {
    // Booking endpoints for different BLS portals
    endpoints: {
        morocco: {
            base: 'https://www.blsspainmorocco.net',
            book: '/MAR/appointment/NewAppointment',
            slotSelect: '/MAR/appointment/SlotSelection',
            confirm: '/MAR/appointment/ConfirmAppointment'
        },
        portugal: {
            base: 'https://www.blsportugal.com',
            book: '/PRT/appointment/NewAppointment',
            slotSelect: '/PRT/appointment/SlotSelection',
            confirm: '/PRT/appointment/ConfirmAppointment'
        }
    },

    // Status codes
    status: {
        BOOKED: 'BOOKED',
        FAILED: 'FAILED',
        PENDING: 'PENDING',
        REDIRECT: 'REDIRECT',
        TOKEN_ERROR: 'TOKEN_ERROR'
    },

    // Retry configuration
    maxRetries: 2,
    retryDelay: 500
};

// ============================================================================
// STATE
// ============================================================================

const sniperState = {
    lastShot: null,
    totalShots: 0,
    successfulShots: 0,
    failedShots: 0,
    isExecuting: false
};

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================

/**
 * Extracts the RequestVerificationToken from various sources.
 * Priority: DOM > Headers > Storage
 * 
 * @param {Object} activeSession - The active session object
 * @returns {Promise<string|null>} The verification token
 */
async function extractVerificationToken(activeSession) {
    // 1. Try to get from session headers (captured by background.js)
    if (activeSession?.headers?.['__RequestVerificationToken']) {
        console.log('[Sniper] Token found in session headers');
        return activeSession.headers['__RequestVerificationToken'];
    }

    // 2. Try to extract from DOM data if available
    if (activeSession?.domData?.verificationToken) {
        console.log('[Sniper] Token found in DOM data');
        return activeSession.domData.verificationToken;
    }

    // 3. Request fresh token from content script
    try {
        const token = await requestTokenFromPage(activeSession.tabId);
        if (token) {
            console.log('[Sniper] Token extracted from page');
            return token;
        }
    } catch (error) {
        console.warn('[Sniper] Failed to extract token from page:', error);
    }

    // 4. Try storage as last resort
    try {
        const stored = await chrome.storage.local.get(['verificationToken']);
        if (stored.verificationToken) {
            console.log('[Sniper] Token found in storage');
            return stored.verificationToken;
        }
    } catch (error) {
        console.warn('[Sniper] Failed to get token from storage:', error);
    }

    return null;
}

/**
 * Requests the verification token from the content script on the page.
 * 
 * @param {number} tabId - The tab ID to request from
 * @returns {Promise<string|null>} The token
 */
async function requestTokenFromPage(tabId) {
    if (!tabId) return null;

    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'GET_VERIFICATION_TOKEN' }, response => {
            if (chrome.runtime.lastError || !response?.success) {
                resolve(null);
                return;
            }
            resolve(response.token);
        });
    });
}

// ============================================================================
// BOOKING DATA RETRIEVAL
// ============================================================================

/**
 * Retrieves stored booking configuration (visa type, center, etc.).
 * 
 * @returns {Promise<Object>} Booking configuration
 */
async function getBookingConfig() {
    const defaults = {
        visaType: '',
        visaSubType: '',
        center: '',
        appointmentCategory: '',
        applicantCount: 1
    };

    try {
        const stored = await chrome.storage.local.get(['bookingConfig']);
        return { ...defaults, ...stored.bookingConfig };
    } catch (error) {
        console.warn('[Sniper] Failed to get booking config:', error);
        return defaults;
    }
}

/**
 * Detects which portal to use based on URL or session.
 * 
 * @param {Object} activeSession - The active session
 * @returns {Object} Portal configuration
 */
function detectPortal(activeSession) {
    const url = activeSession?.url || '';
    if (url.includes('blsportugal.com')) {
        return SNIPER_CONFIG.endpoints.portugal;
    }
    return SNIPER_CONFIG.endpoints.morocco;
}

// ============================================================================
// CORE SNIPER FUNCTIONS
// ============================================================================

/**
 * Builds the booking request headers.
 * 
 * @param {string} verificationToken - The CSRF token
 * @param {Object} activeSession - The active session
 * @returns {Object} Headers object
 */
function buildBookingHeaders(verificationToken, activeSession) {
    const headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

    if (verificationToken) {
        headers['__RequestVerificationToken'] = verificationToken;
        headers['RequestVerificationToken'] = verificationToken;
    }

    // Copy User-Agent from session if available
    if (activeSession?.headers?.['User-Agent']) {
        headers['User-Agent'] = activeSession.headers['User-Agent'];
    }

    return headers;
}

/**
 * Constructs the booking payload.
 * 
 * @param {Object} slotData - The slot data { date, slotId, time }
 * @param {string} verificationToken - The CSRF token
 * @param {Object} bookingConfig - The booking configuration
 * @returns {URLSearchParams} The form-encoded body
 */
function buildBookingPayload(slotData, verificationToken, bookingConfig) {
    const body = new URLSearchParams();

    // Core slot data
    body.append('AppointmentDate', slotData.date);
    body.append('AppointmentSlotId', slotData.slotId.toString());
    body.append('AppointmentTime', slotData.time);

    // Visa and center configuration
    body.append('VisaType', bookingConfig.visaType);
    body.append('VisaSubType', bookingConfig.visaSubType || bookingConfig.visaType);
    body.append('Center', bookingConfig.center);
    body.append('AppointmentCategoryId', bookingConfig.appointmentCategory);

    // Additional required fields
    body.append('ApplicantCount', bookingConfig.applicantCount.toString());

    // Verification token (some forms expect it in body)
    if (verificationToken) {
        body.append('__RequestVerificationToken', verificationToken);
    }

    // Timestamp to prevent caching
    body.append('_ts', Date.now().toString());

    return body;
}

/**
 * Executes the Sniper shot - instant booking without UI.
 * 
 * @param {Object} slotData - The slot data { date, slotId, time }
 * @param {Object} activeSession - The active session with cookies/tokens
 * @returns {Promise<Object>} Result { status, reason?, redirectUrl? }
 */
async function executeSniper(slotData, activeSession) {
    if (sniperState.isExecuting) {
        console.warn('[Sniper] Already executing, blocking duplicate shot');
        return { status: SNIPER_CONFIG.status.PENDING, reason: 'Already executing' };
    }

    sniperState.isExecuting = true;
    sniperState.lastShot = Date.now();
    sniperState.totalShots++;

    console.log('[Sniper] 🎯 FIRING! Target:', slotData);

    try {
        // 1. Extract verification token
        const verificationToken = await extractVerificationToken(activeSession);
        if (!verificationToken) {
            console.error('[Sniper] No verification token available');
            sniperState.failedShots++;
            return {
                status: SNIPER_CONFIG.status.TOKEN_ERROR,
                reason: 'Missing RequestVerificationToken'
            };
        }

        // 2. Get booking configuration
        const bookingConfig = await getBookingConfig();

        // 3. Detect portal and build request
        const portal = detectPortal(activeSession);
        const bookingUrl = `${portal.base}${portal.book}`;

        // 4. Build headers and payload
        const headers = buildBookingHeaders(verificationToken, activeSession);
        const body = buildBookingPayload(slotData, verificationToken, bookingConfig);

        console.log('[Sniper] Targeting:', bookingUrl);
        console.log('[Sniper] Payload:', Object.fromEntries(body.entries()));

        // 5. FIRE THE SHOT
        const response = await fetch(bookingUrl, {
            method: 'POST',
            headers,
            body: body.toString(),
            credentials: 'include',
            redirect: 'manual', // Handle redirects manually to detect success
            cache: 'no-store'
        });

        // 6. Analyze response
        const result = await analyzeBookingResponse(response, portal);

        if (result.status === SNIPER_CONFIG.status.BOOKED) {
            sniperState.successfulShots++;
            console.log('[Sniper] ✅ BOOKING SUCCESSFUL!');

            // Broadcast success
            broadcastSniperResult(result, slotData);
        } else {
            sniperState.failedShots++;
            console.log('[Sniper] ❌ Booking failed:', result.reason);
        }

        return result;

    } catch (error) {
        sniperState.failedShots++;
        console.error('[Sniper] Execution error:', error);

        return {
            status: SNIPER_CONFIG.status.FAILED,
            reason: error.message
        };

    } finally {
        sniperState.isExecuting = false;
    }
}

/**
 * Analyzes the booking response to determine success/failure.
 * 
 * @param {Response} response - The fetch response
 * @param {Object} portal - Portal configuration
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeBookingResponse(response, portal) {
    const status = response.status;

    // Check for redirect (usually means success - redirect to payment)
    if (status === 302 || status === 301) {
        const redirectUrl = response.headers.get('Location');

        // Check if redirect is to payment or confirmation page
        if (redirectUrl && (
            redirectUrl.includes('Payment') ||
            redirectUrl.includes('Confirm') ||
            redirectUrl.includes('Success')
        )) {
            return {
                status: SNIPER_CONFIG.status.BOOKED,
                redirectUrl
            };
        }

        return {
            status: SNIPER_CONFIG.status.REDIRECT,
            redirectUrl
        };
    }

    // Success status
    if (status === 200) {
        try {
            const text = await response.text();

            // Check for success indicators in response
            if (
                text.includes('Payment') ||
                text.includes('Confirmation') ||
                text.includes('successfully') ||
                text.includes('booked') ||
                text.includes('appointment has been')
            ) {
                return {
                    status: SNIPER_CONFIG.status.BOOKED
                };
            }

            // Check for failure indicators
            if (
                text.includes('not available') ||
                text.includes('already booked') ||
                text.includes('error') ||
                text.includes('failed')
            ) {
                return {
                    status: SNIPER_CONFIG.status.FAILED,
                    reason: 'Slot no longer available'
                };
            }

            // Ambiguous - might need manual check
            return {
                status: SNIPER_CONFIG.status.PENDING,
                reason: 'Response unclear, check manually'
            };

        } catch (error) {
            return {
                status: SNIPER_CONFIG.status.PENDING,
                reason: 'Could not parse response'
            };
        }
    }

    // Error status codes
    if (status === 429) {
        return {
            status: SNIPER_CONFIG.status.FAILED,
            reason: 'Rate limited (429)'
        };
    }

    if (status === 403 || status === 401) {
        return {
            status: SNIPER_CONFIG.status.FAILED,
            reason: 'Authentication failed'
        };
    }

    return {
        status: SNIPER_CONFIG.status.FAILED,
        reason: `HTTP ${status}: ${response.statusText}`
    };
}

/**
 * Executes Sniper with retry logic.
 * 
 * @param {Object} slotData - Slot data
 * @param {Object} activeSession - Active session
 * @param {number} retries - Number of retries remaining
 * @returns {Promise<Object>} Result
 */
async function executeSniperWithRetry(slotData, activeSession, retries = SNIPER_CONFIG.maxRetries) {
    const result = await executeSniper(slotData, activeSession);

    if (result.status === SNIPER_CONFIG.status.FAILED && retries > 0) {
        console.log(`[Sniper] Retrying... ${retries} attempts remaining`);
        await new Promise(r => setTimeout(r, SNIPER_CONFIG.retryDelay));
        return executeSniperWithRetry(slotData, activeSession, retries - 1);
    }

    return result;
}

// ============================================================================
// EVENT BROADCASTING
// ============================================================================

/**
 * Broadcasts Sniper result to other extension components.
 * 
 * @param {Object} result - The result object
 * @param {Object} slotData - The slot that was targeted
 */
function broadcastSniperResult(result, slotData) {
    chrome.runtime.sendMessage({
        type: 'SNIPER_RESULT',
        payload: {
            ...result,
            slotData,
            timestamp: Date.now()
        }
    }).catch(() => {
        // Ignore if no listeners
    });

    // Also store in local storage for persistence
    chrome.storage.local.set({
        lastBooking: {
            result,
            slotData,
            timestamp: Date.now()
        }
    });
}

/**
 * Gets the current Sniper status.
 * 
 * @returns {Object} Sniper state
 */
function getSniperStatus() {
    return {
        ...sniperState,
        config: SNIPER_CONFIG
    };
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;

    switch (type) {
        case 'EXECUTE_SNIPER':
            executeSniperWithRetry(payload?.slotData, payload?.activeSession)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({
                    status: SNIPER_CONFIG.status.FAILED,
                    reason: error.message
                }));
            return true;

        case 'SNIPER_STATUS':
            sendResponse(getSniperStatus());
            break;

        case 'SET_BOOKING_CONFIG':
            chrome.storage.local.set({ bookingConfig: payload })
                .then(() => sendResponse({ success: true }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'GET_BOOKING_CONFIG':
            getBookingConfig()
                .then(config => sendResponse({ success: true, config }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;
    }

    return false;
});

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof globalThis !== 'undefined') {
    globalThis.AntigravitySniper = {
        executeSniper,
        executeSniperWithRetry,
        getSniperStatus,
        getBookingConfig,
        SNIPER_CONFIG
    };
}

console.log('[Sniper] Module loaded and ready to fire');
