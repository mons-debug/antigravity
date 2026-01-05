/**
 * Antigravity Operator - Content Script (The Soldier)
 * 
 * This content script runs on BLS domains and acts as the ground-level observer.
 * It detects the current page state and reports back to the background service worker.
 * Runs at document_start to capture the earliest possible state.
 */

// Fingerprint spoofing now handled by fingerprint_spoof.js (MAIN world)

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    // Retry configuration for DOM detection
    maxRetries: 30,
    retryInterval: 100, // ms

    // Debounce for mutation observer
    debounceDelay: 250,

    // Auto-fill configuration
    autoFill: {
        enabled: true,
        delayBeforeFill: 500
    },

    // Page state identifiers
    states: {
        LOGIN: 'LOGIN',
        OTP: 'OTP',
        DASHBOARD: 'DASHBOARD',
        BOOKING_GATE: 'BOOKING_GATE',
        TERMS: 'TERMS',
        LOBBY: 'LOBBY',
        APPOINTMENT: 'APPOINTMENT',
        APPLICANT_FORM: 'APPLICANT_FORM',
        CALENDAR: 'CALENDAR',
        LIVENESS: 'LIVENESS',
        CHANGE_PASSWORD: 'CHANGE_PASSWORD',
        PAYMENT: 'PAYMENT',
        UNKNOWN: 'UNKNOWN'
    }
};

// ============================================================================
// BLANK PAGE WATCHDOG (Recovers from 502/504 hangs)
// ============================================================================
(function initWatchdog() {
    // Only run in top frame
    if (window.self !== window.top) return;

    // Give the page 5 seconds to show SOME content
    setTimeout(() => {
        // Skip if we already rotated/reloaded
        if (window.hasTriggeredRotation) return;

        const bodyText = document.body?.innerText || '';
        const htmlLen = document.documentElement.innerHTML.length;

        // Condition 1: Almost empty body (typical 502/504 or blank render)
        // Condition 2: "White screen of death"
        if (bodyText.length < 50 && htmlLen < 500) {
            console.error('[Watchdog] 🚨 Blank page detected after 5s! Reloading...');
            window.location.reload();
        }
    }, 5000);
})();

// ============================================================================
// AUTO-LOGIN LOCK (Prevents race condition / spam loop)
// ============================================================================
let isAutoLoginPending = false;

// ============================================================================
// PAGE STATE DETECTION
// ============================================================================

/**
 * Detects the current page state based on DOM elements.
 * Uses specific element IDs and classes to identify the page type.
 * 
 * @returns {string} - The detected page state
 */
function detectPageState() {
    const url = window.location.href.toLowerCase();
    const bodyText = document.body?.innerText || '';
    const pageTitle = document.title || '';

    // -----------------------------------------------------------
    // PRIORITY 0: RATE LIMIT / BAN / ERROR PAGES (CRITICAL)
    // -----------------------------------------------------------

    // -----------------------------------------------------------
    // PRIORITY 0: RATE LIMIT / BAN / ERROR PAGES (CRITICAL)
    // -----------------------------------------------------------

    const criticalPhrases = [
        'Too Many Requests',
        'Service Temporarily Restricted',
        'Request Blocked',
        'Access Denied',
        'Max challenge attempts exceeded',
        'maximum attempts',
        'try again later',
        'An error occured while processing your request',  // BLS specific
        'error occurred while processing',
        'Please try again after sometime'
    ];

    const detectedPhrase = criticalPhrases.find(phrase => bodyText.includes(phrase));
    const isTitleBlocked = pageTitle.includes('429') || pageTitle.includes('403') || pageTitle.includes('Access Denied');

    if (detectedPhrase || isTitleBlocked) {
        // Log the specific reason for debugging false positives
        console.error(`[Antigravity] 🚨 RATE LIMIT / BAN PAGE DETECTED! Trigger: "${detectedPhrase || 'Title: ' + pageTitle}"`);

        console.error('[Antigravity] 🚨 RATE LIMIT / BAN PAGE DETECTED! Requesting Rotation...');

        // Prevent spam - only trigger once per page load
        if (window.hasTriggeredRotation) {
            console.log('[Antigravity] Rotation already triggered, waiting for reload...');
            return 'BLOCKED';
        }
        window.hasTriggeredRotation = true;

        // ============================================================
        // ROTATION COOLDOWN - Prevent infinite loop when all proxies burned
        // ============================================================
        const ROTATION_COOLDOWN = 10000; // 10 seconds (shortened for testing)
        const lastRotationTime = parseInt(sessionStorage.getItem('lastRotationTime') || '0');
        const rotationCount = parseInt(sessionStorage.getItem('rotationCount') || '0');
        const now = Date.now();

        if (now - lastRotationTime < ROTATION_COOLDOWN) {
            console.error('[Antigravity] ⛔ ROTATION COOLDOWN - Getting blocked immediately after rotation!');

            // Get current proxy info for debugging
            chrome.runtime.sendMessage({ type: 'GET_PROXY_STATUS' }, (proxyStatus) => {
                const proxyInfo = proxyStatus?.status || 'Unknown';
                document.body.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#fff;font-family:system-ui;text-align:center;padding:20px;">
                        <h1 style="font-size:48px;">⛔</h1>
                        <h2 style="color:#ff6b6b;">Blocked After Rotation</h2>
                        <p style="color:#888;max-width:400px;">BLS blocked the new proxy immediately. Possible causes:</p>
                        <ul style="color:#aaa;text-align:left;max-width:400px;margin:15px 0;">
                            <li>All proxies are from same datacenter (blacklisted)</li>
                            <li>Proxy authentication not working</li>
                            <li>Proxy is not actually being applied</li>
                        </ul>
                        <div style="background:#2a2a4e;padding:15px;border-radius:8px;margin:15px 0;text-align:left;font-family:monospace;font-size:12px;">
                            <p>🔄 Rotations this session: <b>${rotationCount}</b></p>
                            <p>⏱️ Last rotation: <b>${Math.round((now - lastRotationTime) / 1000)}s ago</b></p>
                            <p>📡 Current Proxy: <b>${JSON.stringify(proxyInfo)}</b></p>
                        </div>
                        <button onclick="sessionStorage.clear();location.reload()" style="margin-top:20px;padding:15px 30px;background:#4a90d9;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;">Force Retry (Skip Cooldown)</button>
                        <button onclick="window.open('chrome://extensions')" style="margin-top:10px;padding:10px 20px;background:transparent;color:#888;border:1px solid #444;border-radius:8px;cursor:pointer;">Check Service Worker Logs</button>
                    </div>
                `;
            });

            return 'BLOCKED';
        }

        // Increment rotation counter
        try {
            sessionStorage.setItem('rotationCount', (rotationCount + 1).toString());
            sessionStorage.setItem('lastRotationTime', now.toString());
        } catch (e) { }

        // FAST client-side clear (sync only - no slow async operations)
        // Note: Don't clear sessionStorage here - we need lastRotationTime to persist
        try { localStorage.clear(); } catch (e) { }

        // Show quick visual indicator
        document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#1a1a2e;color:#fff;font-family:system-ui;">
                <h1 style="font-size:48px;">🔄</h1>
                <h2>Rotating...</h2>
            </div>
        `;

        // Send rotation request - Background handles proxy + wipe
        chrome.runtime.sendMessage({
            type: 'ROTATE_PROXY',
            reason: 'PAGE_CONTENT_BLOCKED',
            reloadTab: true
        });

        // FAST FAILSAFE: Redirect to login page after 2 seconds
        setTimeout(() => {
            console.log('[Antigravity] ⏰ Fast failsafe - redirecting to login');
            window.location.href = 'https://www.blsspainmorocco.net/MAR/account/login';
        }, 2000);

        return 'BLOCKED'; // Stop all other logic
    }

    // -----------------------------------------------------------
    // PRIORITY 1: APPOINTMENT / CALENDAR (Highest priority after ban)
    // -----------------------------------------------------------
    if (document.querySelector('#datepicker') ||
        document.querySelector('.appointment-slots') ||
        document.querySelector('#gvSlot')) {
        return CONFIG.states.APPOINTMENT;
    }

    // -----------------------------------------------------------
    // PRIORITY 2: LOGIN PAGE (Strict check)
    // -----------------------------------------------------------
    const loginIndicators = [
        'input#UserId',
        'input[name="Email"]',
        'input#txtEmail',
        'input#Email',
        // 'button#btnSubmit', // Too generic - matches Lobby page button causing false positive
        'form[action*="Login"]',
        '#frmLogin'
    ];

    if (loginIndicators.some(s => document.querySelector(s))) {
        return CONFIG.states.LOGIN;
    }

    // Fallback: If URL says Login but no specific fields
    if (url.includes('/account/login') || url.includes('/global/bls/login')) {
        if (!document.querySelector('a[href*="LogOut"]')) {
            return CONFIG.states.LOGIN;
        }
    }

    // -----------------------------------------------------------
    // PRIORITY 3: LOBBY (Visa Type / Order Details)
    // -----------------------------------------------------------
    const lobbyIndicators = [
        'select#AppointmentCategoryId',
        '#ddlCenter',
        '#ddlVisaType',
        '#AppointmentCenterCode',
        'form#frmOrder'
    ];

    if (lobbyIndicators.some(s => document.querySelector(s))) {
        return CONFIG.states.LOBBY;
    }

    // -----------------------------------------------------------
    // PRIORITY 4: BOOKING GATE (Grid Captcha before appointment)
    // MUST CHECK BEFORE DASHBOARD - dashboard selectors match links on captcha page too
    // -----------------------------------------------------------
    const isBookingGatePage = url.includes('/newappointment') ||
        (url.includes('/appointment') && !url.includes('/account/'));

    const hasInstructionText = document.body.innerText.includes('select all boxes') ||
        document.body.innerText.includes('Please select') ||
        document.body.innerText.includes('Captcha Verification');

    const gridImageCandidates = Array.from(document.querySelectorAll('img')).filter(img => {
        const rect = img.getBoundingClientRect();
        return rect.width >= 50 && rect.width <= 200 && rect.height >= 50 && rect.height <= 200;
    });
    const hasGridImages = gridImageCandidates.length >= 6;

    if ((isBookingGatePage && hasGridImages) ||
        (hasInstructionText && hasGridImages) ||
        document.querySelector('#imgCaptcha') ||
        document.querySelector('img[src*="captcha"]')) {
        console.log(`[Antigravity] 🛡️ BOOKING_GATE detected! (URL: ${isBookingGatePage}, Instruction: ${hasInstructionText}, Images: ${gridImageCandidates.length})`);
        return CONFIG.states.BOOKING_GATE;
    }

    // -----------------------------------------------------------
    // PRIORITY 4.5: CHANGE PASSWORD / EXPIRED (Dead End)
    // -----------------------------------------------------------
    if (url.includes('changepassword') || pageTitle.includes('Change Password') || bodyText.includes('Change Password')) {
        return CONFIG.states.CHANGE_PASSWORD;
    }

    if (url.includes('liveness') || bodyText.includes('Liveness Detection')) {
        return CONFIG.states.LIVENESS;
    }

    // -----------------------------------------------------------
    // PRIORITY 5: DASHBOARD / LOGGED-IN AREA (including change password)
    // -----------------------------------------------------------
    const dashboardIndicators = [
        '#ChangePassword',
        '#frmChangePassword',
        'a[href*="Appointment/Appointment"]',
        'a[href*="BookAppointment"]',
        'a[href*="newappointment"]',
        '.navbar a[href*="appointment"]'
    ];

    const isLoggedInArea = url.includes('/account/') ||
        url.includes('/changepassword') ||
        url.includes('/dashboard');

    if (dashboardIndicators.some(s => document.querySelector(s)) || isLoggedInArea) {
        console.log('[Antigravity] Dashboard/Logged-in area detected');
        return CONFIG.states.DASHBOARD;
    }

    // -----------------------------------------------------------
    // PRIORITY 6: TERMS & CONDITIONS
    // -----------------------------------------------------------
    if (document.querySelector('#chkAgree') || document.querySelector('.terms-conditions')) {
        return CONFIG.states.TERMS;
    }

    // -----------------------------------------------------------
    // PRIORITY 7: OTP
    // -----------------------------------------------------------
    if (document.querySelector('#OTP') || document.querySelector('input[name="OTP"]')) {
        return CONFIG.states.OTP;
    }

    // -----------------------------------------------------------
    // PRIORITY 8: PAYMENT
    // -----------------------------------------------------------
    if (document.querySelector('#payment') || document.querySelector('.payment-form')) {
        return CONFIG.states.PAYMENT;
    }

    // -----------------------------------------------------------
    // PRIORITY 9: LIVENESS
    // -----------------------------------------------------------
    if (document.querySelector('#btnStartLiveness') || document.querySelector('.liveness-container')) {
        return CONFIG.states.LIVENESS;
    }

    return CONFIG.states.UNKNOWN;
}

/**
 * Extracts relevant DOM data for the current page state.
 * This provides additional context for The Scout's operations.
 * 
 * @param {string} pageState - The current page state
 * @returns {Object} - Extracted DOM data
 */
function extractDOMData(pageState) {
    const data = {
        pageState,
        url: window.location.href,
        title: document.title,
        timestamp: Date.now()
    };

    switch (pageState) {
        case CONFIG.states.LOGIN:
            data.loginForm = {
                emailField: !!document.querySelector('#txtEmail, #Email, input[type="email"]'),
                passwordField: !!document.querySelector('#txtPassword, #Password, input[type="password"]'),
                submitButton: !!document.querySelector('button[type="submit"], input[type="submit"], #btnSubmit')
            };
            break;

        case CONFIG.states.OTP:
            data.otpForm = {
                otpField: !!document.querySelector('#otp, #txtOTP, input[name="otp"]'),
                resendButton: !!document.querySelector('[id*="resend"], [class*="resend"]'),
                submitButton: !!document.querySelector('button[type="submit"], #btnVerify')
            };
            break;

        case CONFIG.states.APPOINTMENT:
            data.appointmentForm = {
                visaTypeDropdown: !!document.querySelector('#VisaType, #ddlVisaType'),
                visaSubTypeDropdown: !!document.querySelector('#VisaSubType, #ddlVisaSubType'),
                categoryDropdown: !!document.querySelector('#AppointmentCategoryId'),
                selectedVisaType: document.querySelector('#VisaType, #ddlVisaType')?.value,
                selectedVisaSubType: document.querySelector('#VisaSubType, #ddlVisaSubType')?.value
            };
            break;

        case CONFIG.states.CALENDAR:
            data.calendar = {
                dateInput: !!document.querySelector('#AppointmentDate, #appointmentDate'),
                calendarWidget: !!document.querySelector('.k-calendar, [data-role="calendar"]'),
                timeSlots: !!document.querySelector('#AppointmentSlot, #ddlSlot, .time-slot'),
                availableDates: getAvailableCalendarDates()
            };
            break;

        case CONFIG.states.APPLICANT_FORM:
            data.applicantForm = {
                firstName: !!document.querySelector('#FirstName'),
                lastName: !!document.querySelector('#LastName'),
                passportNumber: !!document.querySelector('#PassportNumber'),
                nationality: !!document.querySelector('#Nationality'),
                dateOfBirth: !!document.querySelector('#DateOfBirth'),
                email: !!document.querySelector('#Email'),
                phone: !!document.querySelector('#Phone, #PhoneNumber'),
                hasVerificationToken: !!extractVerificationToken()
            };
            break;

        case CONFIG.states.LIVENESS:
            data.liveness = {
                startButton: !!document.querySelector('#btnStartLiveness, [id*="liveness"]'),
                videoElement: !!document.querySelector('video'),
                isActive: !!document.querySelector('.liveness-active, .recording')
            };
            break;

        case CONFIG.states.PAYMENT:
            data.payment = {
                payButton: !!document.querySelector('#btnPay, .pay-now'),
                amount: document.querySelector('.payment-amount, .total-amount')?.textContent
            };
            break;
    }

    return data;
}

/**
 * Attempts to extract available dates from the calendar widget.
 * 
 * @returns {Array} - Array of available date strings
 */
function getAvailableCalendarDates() {
    const availableDates = [];

    // Kendo calendar available dates
    const kendoCells = document.querySelectorAll('.k-calendar td:not(.k-state-disabled) .k-link');
    kendoCells.forEach(cell => {
        const dateAttr = cell.getAttribute('data-value') || cell.getAttribute('title');
        if (dateAttr) {
            availableDates.push(dateAttr);
        }
    });

    return availableDates.slice(0, 10); // Limit to first 10 for performance
}

// ============================================================================
// COOKIE EXTRACTION
// ============================================================================

/**
 * Extracts accessible cookies from document.cookie.
 * Note: HttpOnly cookies won't be visible here, background.js handles those.
 * 
 * @returns {Array} - Array of parsed cookie objects
 */
function extractAccessibleCookies() {
    const cookies = [];
    const cookieString = document.cookie;

    if (!cookieString) {
        return cookies;
    }

    cookieString.split(';').forEach(cookie => {
        const [name, ...valueParts] = cookie.trim().split('=');
        if (name) {
            cookies.push({
                name: name.trim(),
                value: valueParts.join('=').trim(),
                domain: window.location.hostname,
                path: '/',
                accessible: true // Indicates this was accessible via document.cookie
            });
        }
    });

    return cookies;
}

/**
 * Extracts the RequestVerificationToken from the page.
 * Checks hidden form fields and meta tags.
 * 
 * @returns {string|null} - The verification token or null
 */
function extractVerificationToken() {
    // Try hidden input field (most common in ASP.NET MVC)
    const tokenInput = document.querySelector(
        'input[name="__RequestVerificationToken"], ' +
        'input[name="RequestVerificationToken"], ' +
        'input[name="_token"], ' +
        'input[name="csrf_token"]'
    );

    if (tokenInput?.value) {
        return tokenInput.value;
    }

    // Try meta tag (common in SPAs)
    const metaToken = document.querySelector(
        'meta[name="csrf-token"], ' +
        'meta[name="_token"], ' +
        'meta[name="__RequestVerificationToken"]'
    );

    if (metaToken?.content) {
        return metaToken.content;
    }

    // Try to find in any form on the page
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
        const input = form.querySelector('input[type="hidden"][name*="Token"], input[type="hidden"][name*="token"]');
        if (input?.value) {
            return input.value;
        }
    }

    return null;
}

// ============================================================================
// COMMUNICATION WITH BACKGROUND
// ============================================================================

/**
 * Sends the current page state to the background service worker.
 * 
 * @param {string} pageState - The detected page state
 * @param {Object} domData - Additional DOM data
 */
function sendPageState(pageState, domData) {
    const payload = {
        url: window.location.href,
        cookies: extractAccessibleCookies(),
        pageState,
        domData,
        timestamp: Date.now(),
        userAgent: navigator.userAgent
    };

    chrome.runtime.sendMessage({
        type: 'PAGE_STATE',
        payload
    }, response => {
        if (chrome.runtime.lastError) {
            console.warn('[Antigravity] Failed to send page state:', chrome.runtime.lastError.message);
            return;
        }

        if (response?.success) {
            console.log(`[Antigravity] Page state reported: ${pageState}`, response.sessionId);
        }
    });
}

// ============================================================================
// INITIALIZATION & MONITORING
// ============================================================================

/**
 * Debounce utility for the mutation observer.
 */
let debounceTimer = null;
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}

/**
 * Main detection function with retry logic.
 * Waits for DOM to be ready before detecting state.
 */
function runDetection(attempt = 0) {
    const pageState = detectPageState();

    // If state is unknown and we haven't exhausted retries, try again
    if (pageState === CONFIG.states.UNKNOWN && attempt < CONFIG.maxRetries) {
        setTimeout(() => runDetection(attempt + 1), CONFIG.retryInterval);
        return;
    }

    const domData = extractDOMData(pageState);

    console.log('[Antigravity] Detected page state:', pageState, domData);

    // Send state to background
    sendPageState(pageState, domData);

    // Handle state-specific actions
    handleStateActions(pageState, domData);

    // Set up mutation observer for dynamic content changes
    setupMutationObserver();
}

/**
 * Handles automatic actions based on the detected page state.
 * 
 * @param {string} pageState - The detected page state
 * @param {Object} domData - Extracted DOM data
 */
async function handleStateActions(pageState, domData) {
    switch (pageState) {
        case CONFIG.states.LOGIN:
            console.log('[Antigravity] Login page detected, checking for auto-login...');
            if (!isAutoLoginPending) {
                await attemptAutoLogin();
            } else {
                console.log('[Antigravity] Auto-login already in progress, skipping...');
            }
            break;

        case CONFIG.states.DASHBOARD:
            console.log('[Antigravity] Dashboard detected, navigating...');
            await attemptNavigation('DASHBOARD');
            break;

        case CONFIG.states.BOOKING_GATE:
            console.log('[Antigravity] 🛡️ Booking Gate detected');
            await attemptNavigation('BOOKING_GATE');
            break;

        case CONFIG.states.TERMS:
            console.log('[Antigravity] Terms detected');
            await attemptNavigation('TERMS');
            break;

        case CONFIG.states.LOBBY:
            console.log('[Antigravity] ⛺ The Lobby detected (Camping)');
            await attemptNavigation('LOBBY');
            break;

        case CONFIG.states.APPLICANT_FORM:
            if (CONFIG.autoFill.enabled) {
                console.log('[Antigravity] Applicant form detected, attempting auto-fill...');
                await attemptAutoFill();
            }
            break;

        case CONFIG.states.LIVENESS:
            console.log('[Antigravity] Liveness page detected');
            // Notify background that liveness page is active
            chrome.runtime.sendMessage({
                type: 'LIVENESS_PAGE_DETECTED',
                payload: domData
            }).catch(() => { });
            break;

        case CONFIG.states.PAYMENT:
            console.log('[Antigravity] Payment page detected');
            chrome.runtime.sendMessage({
                type: 'PAYMENT_PAGE_DETECTED',
                payload: domData
            }).catch(() => { });
            break;
    }
}

/**
 * Attempts automatic navigation using the Navigator module.
 * @param {string} pageState - The current page state
 */
async function attemptNavigation(pageState) {
    if (!globalThis.AntigravityNavigator) {
        console.warn('[Antigravity] Navigator module not loaded');
        return;
    }

    // Fast - minimal delay
    await new Promise(r => setTimeout(r, 100));

    try {
        const result = await globalThis.AntigravityNavigator.handleNavigation(pageState);
        console.log(`[Antigravity] Navigation result for ${pageState}:`, result);

        chrome.runtime.sendMessage({
            type: 'LOG_UPDATE',
            payload: {
                message: result.success
                    ? `✅ Navigated: ${pageState}`
                    : `⚠️ Navigation issue: ${result.reason}`,
                level: result.success ? 'success' : 'warning'
            }
        }).catch(() => { });
    } catch (error) {
        console.error('[Antigravity] Navigation error:', error);
    }
}

/**
 * Attempts auto-login using active client credentials.
 * Uses a lock to prevent race conditions from repeated detection calls.
 */
async function attemptAutoLogin() {
    // LOCK: Prevent race condition / spam loop
    if (isAutoLoginPending) {
        console.log('[Antigravity] ⏳ Auto-login already pending, skipping duplicate call');
        return;
    }
    isAutoLoginPending = true;

    // Safety timeout to release lock in case of crash/hang
    const lockTimeout = setTimeout(() => {
        if (isAutoLoginPending) {
            console.warn('[Antigravity] ⚠️ Auto-login lock timed out - forcing release');
            isAutoLoginPending = false;
        }
    }, 30000); // 30s timeout

    try {
        // Check if LoginManager is available
        if (!globalThis.AntigravityLoginManager) {
            console.warn('[Antigravity] LoginManager not loaded (Global Object Missing)');
            isAutoLoginPending = false;
            clearTimeout(lockTimeout);
            return;
        }

        console.log('[Antigravity] 🔑 Requesting Active Client...');

        // Wrap sendMessage in Promise for clean await
        const response = await new Promise(resolve => {
            chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CLIENT' }, resolve);
        });

        if (chrome.runtime.lastError) {
            console.warn('[Antigravity] Runtime Error getting client:', chrome.runtime.lastError.message);
            return;
        }

        if (!response || !response.client) {
            console.warn('[Antigravity] ⚠️ No active client returned from Background.');
            return;
        }

        const client = response.client;
        console.log(`[Antigravity] 👤 Attempting login for: ${client.email}`);

        // Small delay to ensure DOM is ready
        await new Promise(r => setTimeout(r, 500));

        // EXECUTE LOGIN
        const result = await globalThis.AntigravityLoginManager.attemptLogin(client);

        if (result.success) {
            console.log(`[Antigravity] ✅ Login Action Result: ${result.status}`);

            // Notify popup
            chrome.runtime.sendMessage({
                type: 'LOG_UPDATE',
                payload: {
                    message: `🔐 Form Submitted: ${result.status}`,
                    level: 'success'
                }
            }).catch(() => { });

        } else {
            console.error(`[Antigravity] ❌ Login Failed: ${result.reason}`);

            // Handle specific failures
            if (result.reason === 'FORM_NOT_FOUND') {
                console.warn('[Antigravity] ⚠️ Retrying detection in 2s...');
                setTimeout(() => runDetection(), 2000);
            }

            chrome.runtime.sendMessage({
                type: 'LOG_UPDATE',
                payload: {
                    message: `❌ Auto-login Failed: ${result.reason}`,
                    level: 'error'
                }
            }).catch(() => { });
        }

    } catch (error) {
        console.error('[Antigravity] 💥 Error in attemptAutoLogin:', error);
    } finally {
        isAutoLoginPending = false;
        clearTimeout(lockTimeout);
    }
}

/**
 * Attempts to auto-fill the applicant form with active client data.
 */
async function attemptAutoFill() {
    // Wait before filling to ensure form is fully loaded
    await new Promise(r => setTimeout(r, CONFIG.autoFill.delayBeforeFill));

    // Request active client data from background
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_CLIENT' }, async (response) => {
        if (chrome.runtime.lastError) {
            console.warn('[Antigravity] Could not get active client:', chrome.runtime.lastError.message);
            return;
        }

        if (response?.success && response.client) {
            console.log('[Antigravity] Auto-filling with client data...');

            // Call form filler (if loaded)
            if (globalThis.AntigravityFormFiller?.fillApplicantForm) {
                const result = await globalThis.AntigravityFormFiller.fillApplicantForm(response.client);
                console.log('[Antigravity] Auto-fill result:', result);
            } else {
                // Send message to form filler
                chrome.runtime.sendMessage({
                    type: 'FILL_FORM',
                    payload: response.client
                });
            }
        } else {
            console.log('[Antigravity] No active client data for auto-fill');
        }
    });
}

/**
 * Sets up a mutation observer to detect page state changes.
 * Useful for SPAs or dynamically loaded content.
 */
function setupMutationObserver() {
    const debouncedCheck = debounce(() => {
        const newState = detectPageState();
        const domData = extractDOMData(newState);

        // Only send if state has meaningfully changed
        if (newState !== lastReportedState) {
            lastReportedState = newState;
            console.log('[Antigravity] Page state changed:', newState);
            sendPageState(newState, domData);

            // Handle new state actions
            handleStateActions(newState, domData);
        }
    }, CONFIG.debounceDelay);

    const observer = new MutationObserver(debouncedCheck);

    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: false
    });
}

// Track last reported state to avoid redundant reports
let lastReportedState = null;

/**
 * Initialize the content script.
 * Runs detection as soon as possible, with retries for dynamic content.
 */
function initialize() {
    console.log('[Antigravity] Content script initialized on:', window.location.href);

    // Mark this page as having the extension active
    window.__ANTIGRAVITY_ACTIVE__ = true;

    // Run detection based on document ready state
    if (document.readyState === 'loading') {
        // DOM not ready yet, wait for DOMContentLoaded
        document.addEventListener('DOMContentLoaded', () => runDetection());
    } else {
        // DOM is already ready, run immediately with a small delay for dynamic content
        setTimeout(() => runDetection(), 50);
    }

    // Also run on load for any late-loading content
    window.addEventListener('load', () => {
        setTimeout(() => runDetection(), 100);
    });

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case 'REQUEST_STATE':
                const state = detectPageState();
                const data = extractDOMData(state);
                sendResponse({ success: true, pageState: state, domData: data });
                break;

            case 'PING':
                sendResponse({ success: true, active: true });
                break;

            case 'GET_VERIFICATION_TOKEN':
                const token = extractVerificationToken();
                sendResponse({ success: !!token, token });
                break;

            case 'FILL_FORM':
                // Forward to form filler if available
                if (globalThis.AntigravityFormFiller?.fillApplicantForm) {
                    globalThis.AntigravityFormFiller.fillApplicantForm(message.payload)
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                }
                sendResponse({ success: false, error: 'FormFiller not loaded' });
                break;

            case 'HANDLE_LIVENESS':
                if (globalThis.AntigravityFormFiller?.handleLiveness) {
                    globalThis.AntigravityFormFiller.handleLiveness()
                        .then(result => sendResponse(result))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                    return true;
                }
                sendResponse({ success: false, error: 'FormFiller not loaded' });
                break;

            case 'TRIGGER_AUTO_FILL':
                attemptAutoFill()
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;

            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
        return false;
    });
}

// ============================================================================
// ENTRY POINT
// ============================================================================

// Run initialization immediately (since we're injected at document_start)
initialize();

