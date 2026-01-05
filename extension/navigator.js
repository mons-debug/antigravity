/**
 * Antigravity Operator - Navigator (The Navigator)
 * 
 * Handles automatic page navigation through the BLS booking flow.
 * Dashboard -> Terms -> Order Details (Lobby) -> Calendar
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const NAVIGATOR_CONFIG = {
    selectors: {
        // Dashboard page
        dashboard: {
            updatePasswordForm: '#ChangePassword, form[action*="ChangePassword"], #frmChangePassword',
            bookButton: 'a[href*="appointment"], button:contains("Book"), .book-appointment-btn, a:contains("Schedule")',
            bookLinks: [
                'a[href*="/Appointment/Appointment"]',
                'a[href*="/appointment"]',
                'a[href*="/book"]',
                '.btn-book',
                '#btnNewAppointment',
                'a.book-now',
                '[data-action="book"]'
            ],
            // Text patterns to look for in links
            bookTextPatterns: ['Book Appointment', 'Book New Appointment', 'Schedule Appointment', 'New Appointment']
        },

        // Booking Gate (Intermediate Captcha)
        bookingGate: {
            captchaImage: '#imgCaptcha, .captcha-img, img[src*="captcha"]',
            captchaInput: '#txtCaptcha, input[name*="captcha"]',
            verifyButton: '#btnVerify, button:contains("Verify"), input[type="submit"]',
            errorMsg: '.text-danger, .error-message'
        },

        // Terms page
        terms: {
            checkbox: '#chkAgree, input[type="checkbox"][name*="agree"], input[type="checkbox"][name*="term"]',
            checkboxLabels: 'label:contains("I agree"), label:contains("Accept")',
            continueButton: '#btnContinue, button[type="submit"], input[type="submit"], .btn-continue, button:contains("Continue")',
            submitButtons: ['#btnSubmit', '#btnContinue', '.btn-primary[type="submit"]', 'button:contains("Submit")']
        },

        // The Lobby (Visa Order Page)
        lobby: {
            // Updated selectors for robustness
            appointmentTypeDropdown: '#AppointmentType, select[name*="AppointmentType"], #ddlAppointmentType',
            appointmentTypeRadios: 'input[type="radio"][name*="AppointmentType"]',
            centerDropdown: '#ddlCenter, #centerId, select[name*="center"], #AppointmentCenterCode, #CenterId',
            categoryDropdown: '#AppointmentCategoryId, #ddlCategory, select[name*="category"], #CategoryId',
            visaTypeDropdown: '#ddlVisaType, select[name*="visa"], #VisaType, #VisaTypeId',
            visaSubTypeDropdown: '#ddlVisaSubType, select[name*="subtype"], #VisaSubType',
            phoneCodeDropdown: '#ddlPhoneCode, #phoneCode, select[name*="phone"]',
            phoneInput: '#txtPhoneNumber, #phoneNumber, input[name*="phone"]',
            agreeCheckbox: '#chkAgree, #agree, input[type="checkbox"][name*="agree"]',
            verifyButton: '#btnVerify, #btnSubmit, button[type="submit"]:contains("Verify"), input[value="Verify"], button:contains("Submit")'
        }
    },

    delays: {
        min: 100,           // Was 500
        max: 300,           // Was 1500
        betweenActions: 200, // Was 800
        afterPageLoad: 300,  // Was 1500
        afterDropdownChange: 1500  // Increased to 1500ms to wait for AJAX reloads
    },

    autoNavigate: true
};

// ============================================================================
// STATE
// ============================================================================

let isNavigating = false;
let navigationAttempts = 0;
const MAX_ATTEMPTS = 3;
let isCamping = false;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomDelay(min = NAVIGATOR_CONFIG.delays.min, max = NAVIGATOR_CONFIG.delays.max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

function trustedClick(element) {
    if (!element) return false;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus();
    const events = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'];
    events.forEach(eventType => {
        const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
        element.dispatchEvent(event);
    });
    try { element.click(); } catch (e) { }
    return true;
}

function findElement(selectors) {
    if (typeof selectors === 'string') selectors = [selectors];
    for (const selector of selectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isVisible(element)) return element;
            if (selector.includes(':contains(')) {
                const match = selector.match(/([\w]+):contains\("([^"]+)"\)/);
                if (match) {
                    const elements = document.querySelectorAll(match[1]);
                    for (const el of elements) {
                        if (el.textContent.includes(match[2]) && isVisible(el)) return el;
                    }
                }
            }
        } catch (e) { }
    }
    return null;
}

function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
}

async function getClientConfig() {
    try {
        const result = await chrome.storage.local.get(['activeClient']);
        return result.activeClient || null;
    } catch (error) {
        console.error('[Navigator] Failed to get client config:', error);
        return null;
    }
}

async function setDropdownValue(selector, value, waitForReload = false) {
    const element = typeof selector === 'string' ? findElement([selector]) : selector;
    if (!element) {
        console.warn(`[Navigator] Dropdown not found: ${selector}`);
        return false;
    }

    console.log(`[Navigator] Setting dropdown ${element.id || element.name} to: ${value}`);

    try {
        // Check for Kendo UI dropdown
        if (typeof $ !== 'undefined' && $(element).data && $(element).data('kendoDropDownList')) {
            const kendoWidget = $(element).data('kendoDropDownList');
            kendoWidget.value(value);
            kendoWidget.trigger('change');
            console.log(`[Navigator] Kendo dropdown set to: ${value}`);
        } else {
            // Standard select element
            element.value = value;

            // Try to find and select by text if value fails
            if (element.value !== value) {
                // Try matching by option text
                for (const option of element.options) {
                    if (option.text.toLowerCase().includes(value.toLowerCase())) {
                        element.value = option.value;
                        break;
                    }
                }
            }

            // Dispatch change events
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Wait for page update if dropdown triggers AJAX/reload
        if (waitForReload) {
            console.log(`[Navigator] Waiting for dropdown update...`);
            await randomDelay(NAVIGATOR_CONFIG.delays.afterDropdownChange, NAVIGATOR_CONFIG.delays.afterDropdownChange + 500);
        } else {
            await randomDelay(300, 600);
        }

        return true;
    } catch (err) {
        console.error(`[Navigator] Dropdown error:`, err);
        return false;
    }
}

/**
 * Solve Grid CAPTCHA on booking gate (reuses LoginManager logic)
 */
async function solveBookingGridCaptcha() {
    console.log('[Navigator] 🎯 Solving booking gate grid CAPTCHA...');

    // Reuse the LoginManager's grid solving if available
    if (typeof globalThis.AntigravityLoginManager !== 'undefined' &&
        typeof globalThis.AntigravityLoginManager.solveGridCaptcha === 'function') {
        return await globalThis.AntigravityLoginManager.solveGridCaptcha();
    }

    // If LoginManager not available, trigger via message to content.js which has access
    // This is a fallback - the actual grid solving logic is in login_manager.js
    console.log('[Navigator] LoginManager not directly available, using internal grid solver...');

    try {
        // ================================================================
        // SMART WAIT - Ensure page is fully loaded before solving
        // ================================================================
        console.log('[Navigator] ⏳ Waiting for captcha page to fully load...');

        const maxWaitMs = 5000;
        const startWait = Date.now();

        while (Date.now() - startWait < maxWaitMs) {
            const hasInstruction = document.body.innerText.match(/select.*boxes.*number\s*\d{3}/i) ||
                document.body.innerText.match(/Please select/i);
            const gridImagesCheck = Array.from(document.querySelectorAll('img')).filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.width >= 50 && rect.width <= 200 && rect.height >= 50;
            });

            if (hasInstruction && gridImagesCheck.length >= 9) {
                console.log(`[Navigator] ✅ Page ready in ${Date.now() - startWait}ms`);
                break;
            }

            await new Promise(r => setTimeout(r, 200));
        }

        // Get API key from storage
        const result = await chrome.storage.local.get(['globalSettings']);
        const apiKey = result.globalSettings?.captchaApiKey || '';

        if (!apiKey) {
            console.warn('[Navigator] No API key for grid CAPTCHA');
            return false;
        }

        // Find grid images and target
        const bodyText = document.body.innerText;
        const targetMatch = bodyText.match(/(?:select|choose).*?(?:boxes|images).*?(?:with|number)\s*(\d{3})/i);
        const target = targetMatch ? targetMatch[1] : '';

        if (!target) {
            console.warn('[Navigator] Could not find target number');
            return false;
        }

        console.log(`[Navigator] Target number: ${target}`);

        // Get grid images
        const allImages = Array.from(document.querySelectorAll('img'));
        const captchaImages = allImages.filter(img => {
            const rect = img.getBoundingClientRect();
            return rect.width >= 50 && rect.width <= 200 &&
                rect.height >= 50 && rect.height <= 200 &&
                (img.onclick || img.closest('[onclick]') || img.src.toLowerCase().includes('cap'));
        }).slice(0, 9);

        if (captchaImages.length < 9) {
            console.warn(`[Navigator] Only found ${captchaImages.length} grid images`);
            return false;
        }

        // Convert to base64
        const processedImages = await Promise.all(captchaImages.map(async img => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/png');
            } catch (e) {
                return img.src;
            }
        }));

        // Send to server
        const response = await fetch('http://localhost:3000/solve-grid-captcha', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: processedImages, target, apiKey })
        });

        const data = await response.json();

        if (data.success && data.matches && data.matches.length > 0) {
            console.log(`[Navigator] Server returned matches: ${data.matches}`);

            // Click matches
            for (const idx of data.matches) {
                const img = captchaImages[idx];
                if (img) {
                    let clickTarget = img.closest('[onclick]') || img.parentElement || img;
                    if (clickTarget.onclick) clickTarget.onclick();
                    clickTarget.click();
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            console.log('[Navigator] ✅ Grid clicks completed!');
            return true;
        }

        return false;
    } catch (error) {
        console.error('[Navigator] Grid CAPTCHA error:', error);
        return false;
    }
}

// ============================================================================
// NAVIGATION ACTIONS
// ============================================================================

/**
 * Handles Dashboard Navigation (Ignores Password Update)
 */
async function handleDashboardNavigation() {
    if (isNavigating) return { success: false, reason: 'IN_PROGRESS' };
    isNavigating = true;
    console.log('[Navigator] 🏠 Dashboard/Logged-in area detected - finding Book Appointment...');

    try {
        // FAST - no delay, immediately look for booking link

        // Try header nav first (most common location)
        let bookButton = document.querySelector('a[href*="newappointment"]') ||
            document.querySelector('a[href*="Appointment/Appointment"]') ||
            document.querySelector('a[href*="BookAppointment"]');

        if (!bookButton) {
            // Try all selector patterns
            bookButton = findElement(NAVIGATOR_CONFIG.selectors.dashboard.bookLinks);
        }

        // If not found, try text-based search
        if (!bookButton) {
            console.log('[Navigator] Trying text-based link search...');
            const allLinks = document.querySelectorAll('a, button');
            for (const link of allLinks) {
                const text = link.textContent.trim().toLowerCase();
                const href = (link.href || '').toLowerCase();

                if (text.includes('book') && (text.includes('appointment') || text.includes('new'))) {
                    if (isVisible(link)) {
                        bookButton = link;
                        console.log(`[Navigator] Found: "${text}"`);
                        break;
                    }
                }
                if (href.includes('appointment') || href.includes('book')) {
                    if (isVisible(link)) {
                        bookButton = link;
                        console.log(`[Navigator] Found via href: ${href}`);
                        break;
                    }
                }
            }
        }

        if (bookButton) {
            console.log('[Navigator] ✅ Found booking button, clicking...');
            console.log('[Navigator] Button details:', bookButton.tagName, bookButton.href || bookButton.textContent.substring(0, 30));
            trustedClick(bookButton);

            chrome.runtime.sendMessage({
                type: 'LOG_UPDATE',
                payload: { message: '🚀 Starting booking flow...', level: 'info' }
            }).catch(() => { });

            return { success: true, action: 'CLICKED_BOOK' };
        }

        console.warn('[Navigator] ❌ Booking button not found on dashboard');
        return { success: false, reason: 'BUTTON_NOT_FOUND' };
    } finally {
        isNavigating = false;
    }
}

/**
 * Handles Booking Gate (Intermediate Verification - GRID or TEXT Captcha)
 */
async function handleBookingGate() {
    if (isNavigating) return { success: false, reason: 'IN_PROGRESS' };
    isNavigating = true;
    console.log('[Navigator] 🛡️ Booking Gate Captcha detected');

    try {
        await randomDelay(100, 200); // Fast startup

        // Check if this is a GRID captcha (like login) or TEXT captcha
        const gridImages = document.querySelectorAll('img[src*="cap"]');
        const hasGridCaptcha = gridImages.length >= 9 ||
            document.body.innerText.includes('select all boxes') ||
            document.body.innerText.includes('Please select');

        if (hasGridCaptcha) {
            console.log('[Navigator] 🎯 Grid CAPTCHA detected on booking gate');

            // Use the same grid solving logic as login
            if (typeof globalThis.AntigravityLoginManager !== 'undefined') {
                // Trigger grid captcha solving via LoginManager's exposed method
                // We need to call the grid solver directly
                const solved = await solveBookingGridCaptcha();
                if (solved) {
                    console.log('[Navigator] ✅ Booking Grid CAPTCHA solved!');

                    // NEW: Click Submit Button - Optimized Speed (1s)
                    console.log('[Navigator] ⏳ Waiting 1.0s before submitting...');
                    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));

                    const submitBtn = document.querySelector('input[type="submit"]') ||
                        document.querySelector('button[type="submit"]') ||
                        document.querySelector('#btnSubmit') ||
                        document.querySelector('input.btn-warning') ||
                        document.evaluate("//button[contains(text(),'Submit')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

                    if (submitBtn) {
                        console.log('[Navigator] 👆 Clicking Submit button...');
                        // ROBUST CLICK STRATEGY:
                        // Use SIMPLE click for Submit to avoid anti-bot triggering on complex events
                        try {
                            submitBtn.click();
                        } catch (e) {
                            console.error('[Navigator] Submit click failed:', e);
                            try { submitBtn.click(); } catch (err) { }
                        }
                    }
                } else {
                    console.warn('[Navigator] ⚠️ Submit button not found on booking gate!');
                }

                return { success: true, action: 'GATE_GRID_SOLVED' };
            }
        }

        console.warn('[Navigator] Grid captcha solving failed, waiting for retry...');
        // Don't return false immediately, allow content.js to retry without "IN_PROGRESS" lock if we failed here
        isNavigating = false;
        return { success: false, reason: 'GRID_CAPTCHA_FAILED' };
    }

        // TEXT CAPTCHA handling (original logic)
        }
    }

// TEXT CAPTCHA handling (original logic)
const checkSelectors = NAVIGATOR_CONFIG.selectors.bookingGate;
const captchaImg = findElement([checkSelectors.captchaImage]);
const captchaInput = findElement([checkSelectors.captchaInput]);
const verifyBtn = findElement([checkSelectors.verifyButton]);

if (captchaImg && captchaInput && verifyBtn) {
    console.log('[Navigator] Found Text CAPTCHA, solving...');

    let base64Image = null;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = captchaImg.naturalWidth || captchaImg.width;
        canvas.height = captchaImg.naturalHeight || captchaImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(captchaImg, 0, 0);
        base64Image = canvas.toDataURL('image/png').split(',')[1];
    } catch (e) {
        console.error('[Navigator] Failed to capture captcha:', e);
        return { success: false, reason: 'CAPTURE_FAILED' };
    }

    if (base64Image) {
        const response = await chrome.runtime.sendMessage({
            type: 'SOLVE_CAPTCHA',
            payload: { image: base64Image }
        });

        if (response && response.success && response.solution) {
            console.log('[Navigator] Text CAPTCHA Solved:', response.solution);
            captchaInput.value = response.solution;
            captchaInput.dispatchEvent(new Event('input', { bubbles: true }));
            await randomDelay(100, 200);
            trustedClick(verifyBtn);
            return { success: true, action: 'GATE_TEXT_SOLVED' };
        }
    }
}

return { success: false, reason: 'CAPTCHA_NOT_FOUND_OR_FAILED' };
} catch (error) {
    console.error('[Navigator] Gate error:', error);
    return { success: false, error: error.message };
} finally {
    isNavigating = false;
}
}

/**
 * Handles The Lobby (Camping Mode)
 */
async function enterLobbyMode() {
    if (isCamping) {
        console.log('[Navigator] Already camping in The Lobby');
        return { success: true, status: 'CAMPING' };
    }

    if (isNavigating) return { success: false, reason: 'IN_PROGRESS' };
    isNavigating = true;
    isCamping = true;

    console.log('[Navigator] ⛺ Entering The Lobby (Camping Mode)...');

    try {
        const client = await getClientConfig();
        if (!client) {
            console.warn('[Navigator] No client config for Lobby');
            isCamping = false;
            return { success: false, reason: 'NO_CLIENT' };
        }

        console.log('[Navigator] Client config:', JSON.stringify(client, null, 2));
        await randomDelay(NAVIGATOR_CONFIG.delays.afterPageLoad);
        const selectors = NAVIGATOR_CONFIG.selectors.lobby;

        // ============================================
        // STEP 1: Select Appointment Type (Individual / Family)
        // ============================================
        console.log('[Navigator] Step 1: Selecting Appointment Type (Individual/Family)...');

        // Default to "Individual" if not specified
        const targetType = (client.appointmentType || 'Individual').toLowerCase();

        // Try dropdown first
        const appTypeDropdown = findElement([selectors.appointmentTypeDropdown]);
        if (appTypeDropdown) {
            await setDropdownValue(appTypeDropdown, targetType, true);
        } else {
            // Try radio buttons
            const radios = document.querySelectorAll(selectors.appointmentTypeRadios);
            let clicked = false;
            for (const radio of radios) {
                // Check label or value
                const label = document.querySelector(`label[for="${radio.id}"]`);
                const text = (label ? label.innerText : radio.value).toLowerCase();

                if (text.includes(targetType)) {
                    console.log(`[Navigator] Found radio for ${targetType}, clicking...`);
                    trustedClick(radio);
                    clicked = true;
                    await randomDelay(300, 500); // Wait for potential reload
                    break;
                }
            }
            if (!clicked) console.log('[Navigator] Appointment Type selector not found (might be pre-selected or hidden).');
        }

        // ============================================
        // STEP 2: Select Center (triggers AJAX reload)
        // ============================================
        if (client.center) {
            console.log('[Navigator] Step 2: Selecting Center...');
            await setDropdownValue(selectors.centerDropdown, client.center, true); // waitForReload = true
        }

        // ============================================
        // STEP 3: Select Visa Type
        // ============================================
        if (client.visaType) {
            console.log('[Navigator] Step 3: Selecting Visa Type...');
            await setDropdownValue(selectors.visaTypeDropdown, client.visaType, true);
        }
        if (client.visaSubType) {
            console.log('[Navigator] Step 3b: Selecting Visa Sub-Type...');
            await setDropdownValue(selectors.visaSubTypeDropdown, client.visaSubType, false);
        }

        // ============================================
        // STEP 4: Select Category (Normal/Premium)
        // ============================================
        if (client.category) {
            console.log('[Navigator] Step 4: Selecting Category...');
            await setDropdownValue(selectors.categoryDropdown, client.category, true);
        }

        // ============================================
        // STEP 5: Phone Code + Phone Number
        // ============================================
        if (client.phoneCode) {
            console.log('[Navigator] Step 5: Setting Phone Code...');
            await setDropdownValue(selectors.phoneCodeDropdown, client.phoneCode, false);
        }
        if (client.phone) {
            console.log('[Navigator] Step 5b: Entering Phone Number...');
            const phoneInput = findElement([selectors.phoneInput]);
            if (phoneInput) {
                phoneInput.value = client.phone;
                phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
                phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
                await randomDelay(200, 400);
            }
        }

        // ============================================
        // STEP 6: Click "Agree" Checkbox
        // ============================================
        console.log('[Navigator] Step 6: Clicking Agree checkbox...');
        const agreeCheckbox = findElement([selectors.agreeCheckbox]);
        if (agreeCheckbox && !agreeCheckbox.checked) {
            trustedClick(agreeCheckbox);
            agreeCheckbox.checked = true;
            await randomDelay(200, 400);
        }

        // ============================================
        // STEP 7: Click "Submit" / "Verify" Button
        // ============================================
        console.log('[Navigator] Step 7: Clicking Verify/Submit button...');
        await randomDelay(500, 800);
        const verifyButton = findElement([selectors.verifyButton]);
        if (verifyButton) {
            console.log('[Navigator] ✅ Found Verify button, clicking...');
            trustedClick(verifyButton);
        } else {
            console.warn('[Navigator] ⚠️ Verify button not found');
        }

        console.log('[Navigator] ⛺ Lobby form filled and submitted!');

        chrome.runtime.sendMessage({
            type: 'LOG_UPDATE',
            payload: { message: '⛺ Lobby form submitted. Proceeding...', level: 'success' }
        }).catch(() => { });

        return { success: true, action: 'LOBBY_SUBMITTED' };

    } catch (error) {
        console.error('[Navigator] Lobby error:', error);
        isCamping = false;
        return { success: false, error: error.message };
    } finally {
        isNavigating = false;
    }
}

/**
 * Accepts terms (reused)
 */
async function acceptTerms() {
    // ... existing implementation ...
    // Using simple version here for brevity as it was defined previously
    // Ideally we import or keep the one from previous step.
    // Re-implementing essentially for the full file write

    if (isNavigating) return { success: false, reason: 'IN_PROGRESS' };
    isNavigating = true;
    try {
        await randomDelay(NAVIGATOR_CONFIG.delays.afterPageLoad);
        const checkbox = findElement(NAVIGATOR_CONFIG.selectors.terms.checkbox);
        if (checkbox && !checkbox.checked) {
            trustedClick(checkbox);
            checkbox.checked = true;
        }
        await randomDelay();
        const btn = findElement(NAVIGATOR_CONFIG.selectors.terms.continueButton);
        if (btn) trustedClick(btn);
        return { success: true };
    } finally { isNavigating = false; }
}

async function handleNavigation(pageState) {
    console.log(`[Navigator] Handling state: ${pageState}`);

    switch (pageState) {
        case 'DASHBOARD': return await handleDashboardNavigation();
        case 'BOOKING_GATE': return await handleBookingGate();
        case 'TERMS': return await acceptTerms();
        case 'LOBBY': return await enterLobbyMode();
        default: return { success: false, reason: 'UNKNOWN_STATE' };
    }
}

function reset() {
    isNavigating = false;
    isCamping = false;
    navigationAttempts = 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof globalThis !== 'undefined') {
    globalThis.AntigravityNavigator = {
        handleNavigation,
        handleDashboardNavigation,
        handleBookingGate,
        enterLobbyMode,
        acceptTerms,
        reset,
        NAVIGATOR_CONFIG
    };
}
console.log('[Navigator] The Navigator loaded');
