/**
 * Antigravity Operator - Login Manager (The Gatekeeper)
 * 
 * Handles automatic login with Dynamic Two-Step detection.
 * Supports:
 * - Step 1: Email -> Verify
 * - Step 2: Password + Grid Captcha (User Intervention Required)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOGIN_CONFIG = {
    delays: {
        beforeType: 300 + Math.random() * 200,  // More realistic delay
        betweenChars: 50 + Math.random() * 80,  // Human typing speed ~50-130ms/char
        afterField: 400 + Math.random() * 300,
        beforeSubmit: 800 + Math.random() * 400  // Longer pause before submit
    }
};

// ============================================================================
// STATE
// ============================================================================

let loginAttempts = 0;
let isLoggingIn = false;

// ============================================================================
// HUMAN-LIKE EVENT SIMULATION
// ============================================================================

function dispatchMouseEvent(element, eventType, options = {}) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const event = new MouseEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2 + (Math.random() * 10 - 5),
        clientY: rect.top + rect.height / 2 + (Math.random() * 10 - 5),
        ...options
    });
    element.dispatchEvent(event);
}

function dispatchKeyboardEvent(element, eventType, key) {
    if (!element) return;
    const event = new KeyboardEvent(eventType, {
        bubbles: true,
        cancelable: true,
        view: window,
        key: key,
        code: `Key${key.toUpperCase()}`,
        keyCode: key.charCodeAt(0),
        which: key.charCodeAt(0)
    });
    element.dispatchEvent(event);
}

function dispatchInputEvent(element, inputType = 'insertText', data = '') {
    if (!element) return;
    const event = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: inputType,
        data: data
    });
    element.dispatchEvent(event);
}

async function simulateTyping(element, value) {
    if (!element || !value) return false;

    // Click to focus like a human
    dispatchMouseEvent(element, 'mouseenter');
    await sleep(50);
    dispatchMouseEvent(element, 'mouseover');
    await sleep(30);
    dispatchMouseEvent(element, 'mousedown');
    await sleep(20);
    dispatchMouseEvent(element, 'mouseup');
    dispatchMouseEvent(element, 'click');
    element.focus();

    await sleep(LOGIN_CONFIG.delays.beforeType);

    element.value = '';
    dispatchInputEvent(element, 'deleteContentBackward');

    for (const char of value) {
        // Keyboard events like a real user
        dispatchKeyboardEvent(element, 'keydown', char);
        dispatchKeyboardEvent(element, 'keypress', char);

        element.value += char;
        dispatchInputEvent(element, 'insertText', char);

        dispatchKeyboardEvent(element, 'keyup', char);

        // Random human-like delay between chars
        await sleep(50 + Math.random() * 80);
    }

    await sleep(100);
    element.dispatchEvent(new Event('change', { bubbles: true }));
    dispatchMouseEvent(element, 'blur');
    await sleep(LOGIN_CONFIG.delays.afterField);
    return true;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Smart Wait: Polls for an element until it exists or timeout
 */
async function waitForElement(selector, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el && el.offsetParent !== null) return el;
        await sleep(50);
    }
    return null;
}

/**
 * Wait for session stability after Nuclear Rotation to prevent captcha loops.
 * Waits for document to be fully loaded plus a random settling delay.
 * Also waits for login form elements to appear in DOM.
 */
async function waitForStability() {
    console.log('[LoginManager] ⏳ Waiting for session stability...');

    // 1. Wait for document ready
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            const checkReady = () => {
                if (document.readyState === 'complete') {
                    window.removeEventListener('load', checkReady);
                    resolve();
                }
            };
            window.addEventListener('load', checkReady);
            setTimeout(resolve, 5000);
        });
    }

    // 2. SPINNER AWARENESS: Wait for loading indicators to vanish
    console.log('[LoginManager] ⏳ Checking for spinners/overlays...');
    const spinnerSelectors = ['.preloader', '.loading', '#global-overlay', '.overlay', '.loader', 'div[class*="loading"]'];
    const maxSpinnerWait = 10000;
    const spinnerStart = Date.now();

    while (Date.now() - spinnerStart < maxSpinnerWait) {
        const activeSpinner = spinnerSelectors.find(sel => {
            const el = document.querySelector(sel);
            return el && el.offsetParent !== null; // Visible
        });

        if (!activeSpinner) {
            // Double check: ensure no inputs are disabled
            const disabledInput = document.querySelector('input[disabled], button[disabled]');
            if (!disabledInput) break;
        }

        console.log(`[LoginManager] ⏳ Spinner active: ${activeSpinner || 'Disabled Input'}...`);
        await sleep(500);
    }

    // 3. Wait for login form elements
    console.log('[LoginManager] ⏳ Waiting for login form elements...');
    const maxWaitForForm = 8000; // 8 seconds max
    const startWait = Date.now();

    while (Date.now() - startWait < maxWaitForForm) {
        const hasEmailField = document.querySelector('input[type="email"], input[type="text"], input#Email, input#UserId, input#txtEmail');
        const hasPasswordField = document.querySelector('input[type="password"]');
        const hasButton = document.querySelector('button[type="submit"], input[type="submit"], #btnSubmit, #btnVerify');

        if (hasEmailField || hasPasswordField) {
            console.log(`[LoginManager] ✅ Form elements found in ${Date.now() - startWait}ms`);
            break;
        }

        await sleep(200);
    }

    // Additional random settling delay
    const settlingDelay = 500 + Math.random() * 500;
    console.log(`[LoginManager] 💤 Settling for ${Math.round(settlingDelay)}ms...`);
    await sleep(settlingDelay);

    console.log('[LoginManager] ✅ Session stable');
}

// ============================================================================
// STEP DETECTION & FIELD FINDING
// ============================================================================

/**
 * Detects which step of the login flow we are in.
 */
function getLoginFields() {
    // Find all visible inputs
    const allInputs = Array.from(document.querySelectorAll('input'));
    const visibleInputs = allInputs.filter(el => el.offsetParent !== null);

    const passFields = visibleInputs.filter(el => el.type === 'password');
    const textFields = visibleInputs.filter(el => el.type === 'text' || el.type === 'email');

    console.log(`[LoginManager] Visible Inputs: ${visibleInputs.length}. Password fields: ${passFields.length}. Text fields: ${textFields.length}.`);

    // Button finding logic
    const findBtn = () => {
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
        return btns.find(b => {
            if (b.offsetParent === null) return false;
            const txt = (b.innerText || b.value || '').toLowerCase();
            // Priority keywords based on step
            if (passFields.length > 0) return txt.includes('login') || txt.includes('submit');
            return txt.includes('verify') || txt.includes('next') || txt.includes('submit');
        });
    };

    const submitBtn = findBtn();

    // STEP 2: Password field is visible
    if (passFields.length > 0) {
        return {
            mode: 'STEP_2_PASSWORD',
            passInput: passFields[0],
            submitBtn
        };
    }

    // STEP 1: No Password, but have Text/Email
    if (textFields.length > 0) {
        return {
            mode: 'STEP_1_EMAIL',
            emailInput: textFields[0],
            submitBtn
        };
    }

    return { mode: 'UNKNOWN', visibleInputs };
}

/**
 * Human-like button click with mouse movement simulation
 */
async function humanClick(element) {
    if (!element) return false;

    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await sleep(150 + Math.random() * 100);

    // Simulate mouse movement to button
    dispatchMouseEvent(element, 'mouseenter');
    await sleep(30 + Math.random() * 50);
    dispatchMouseEvent(element, 'mouseover');
    await sleep(50 + Math.random() * 80);
    dispatchMouseEvent(element, 'mousemove');
    await sleep(20 + Math.random() * 30);

    // Click sequence
    dispatchMouseEvent(element, 'mousedown');
    await sleep(80 + Math.random() * 60); // Hold time
    dispatchMouseEvent(element, 'mouseup');
    await sleep(10);
    // REMOVED: dispatchMouseEvent(element, 'click'); - excessive double event

    // Also trigger native click
    try { element.click(); } catch (e) { }

    return true;
}

// ============================================================================
// LOGIN FLOW
// ============================================================================

async function attemptLogin(clientData) {
    if (isLoggingIn) return { success: false, reason: 'IN_PROGRESS' };

    if (!clientData?.email || !clientData?.password) {
        console.error('[LoginManager] Missing credentials');
        return { success: false, reason: 'MISSING_CREDENTIALS' };
    }

    isLoggingIn = true;
    loginAttempts++;
    console.log(`[LoginManager] 🔐 Login attempt ${loginAttempts}...`);

    try {
        // ================================================================
        // CRITICAL: Wait for session stability before engaging
        // ================================================================
        await waitForStability();

        const state = getLoginFields();
        console.log(`[LoginManager] Detection Mode: ${state.mode}`);

        // --- STEP 1: EMAIL ---
        if (state.mode === 'STEP_1_EMAIL') {
            console.log('[LoginManager] Step 1: Filling Email...');
            await simulateTyping(state.emailInput, clientData.email);

            await sleep(LOGIN_CONFIG.delays.beforeSubmit);

            if (state.submitBtn) {
                console.log('[LoginManager] Clicking Verify/Next...');
                await humanClick(state.submitBtn);
            } else {
                console.warn('[LoginManager] No submit button found for Step 1');
                // Try Enter key
                dispatchTrustedEvent(state.emailInput, 'keydown', { key: 'Enter', keyCode: 13 });
            }

            return { success: true, status: 'STEP_1_SUBMITTED' };
        }

        // --- STEP 2: PASSWORD ---
        if (state.mode === 'STEP_2_PASSWORD') {
            console.log('[LoginManager] Step 2: Filling Password...');
            await simulateTyping(state.passInput, clientData.password);

            // CRITICAL: SOLVE GRID CAPTCHA
            console.log('[LoginManager] Detecting Grid Captcha...');
            const gridSolved = await solveGridCaptcha();

            if (gridSolved) {
                await sleep(1000);
                if (state.submitBtn) {
                    console.log('[LoginManager] Clicking Submit...');
                    await humanClick(state.submitBtn);
                    return { success: true, status: 'SUBMITTED' };
                }
            } else {
                console.warn('[LoginManager] ⚠️ Grid Captcha not solved or failed. User intervention required.');
                // Notify User
                chrome.runtime.sendMessage({
                    type: 'LOG_UPDATE',
                    payload: {
                        message: '⚠️ Grid Captcha Failed! Please solve manually.',
                        level: 'warning'
                    }
                }).catch(() => { });

                // Trigger Proxy Rotation after multiple failures
                if (loginAttempts >= 3) {
                    console.warn('[LoginManager] 🔄 Multiple failures detected. Requesting proxy rotation.');
                    chrome.runtime.sendMessage({
                        type: 'ROTATE_PROXY',
                        reason: 'LOGIN_FAILED_REPEATEDLY'
                    }).catch(() => { });
                }

                return { success: true, status: 'WAITING_FOR_USER' };
            }

            return { success: true, status: 'SUBMITTED' };
        }

        // --- UNKNOWN STATE ---
        console.error('[LoginManager] ❌ Could not detect login step.');
        console.log('[X-RAY] 📸 Login fields missing. Scanning DOM...');
        diagnoseDOM();

        return { success: false, reason: 'FORM_NOT_FOUND' };

    } catch (error) {
        console.error('[LoginManager] Error:', error);
        return { success: false, reason: error.message };
    } finally {
        isLoggingIn = false;
    }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

function diagnoseDOM() {
    console.group('🔍 X-RAY DOM DIAGNOSIS');
    const inputs = Array.from(document.querySelectorAll('input'));
    console.table(inputs.map(el => ({
        tag: 'INPUT',
        id: el.id,
        name: el.name,
        type: el.type,
        placeholder: el.placeholder,
        visible: el.offsetParent !== null
    })));
    console.groupEnd();
}

/**
 * Get the effective z-index of an element (checks parents too)
 */
function getEffectiveZIndex(el) {
    let maxZ = 0;
    let current = el;
    while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const z = parseInt(style.zIndex, 10);
        if (!isNaN(z) && z > maxZ) {
            maxZ = z;
        }
        current = current.parentElement;
    }
    return maxZ;
}

/**
 * Extract the 9 grid images by finding the instruction text and nearby images.
 * Excludes script/style tags and focuses on visible text elements.
 */
function getVisualGrid() {
    console.log('[LoginManager] 🔬 Finding grid images...');

    // Step 1: Find the EXACT instruction containing "number XXX" (3 digits)
    let label = null;
    const visibleElements = document.querySelectorAll('p, span, div, label, td, th');

    for (const el of visibleElements) {
        // Skip if inside script or style
        if (el.closest('script') || el.closest('style') || el.closest('noscript')) continue;

        // Skip if not visible
        if (el.offsetParent === null && el.tagName !== 'BODY') continue;

        // Get direct text content
        const text = el.textContent?.trim() || '';

        // STRICT CHECK: Must contain "number" followed by 3 digits (e.g., "number 631")
        // This is the CAPTCHA instruction format
        if (text.match(/number\s+\d{3}/i) && text.includes('select')) {
            label = el;
            console.log(`[LoginManager] 📍 Found instruction: "${text.substring(0, 60)}"`);
            break;
        }
    }

    // Step 2: Find grid images - look for 3x3 grid pattern
    // Strategy: Find all images with proper size, sort by position, take 9
    const allImages = Array.from(document.querySelectorAll('img'));

    console.log(`[LoginManager] 📷 Total images on page: ${allImages.length}`);

    // Filter to grid-sized, visible, clickable images
    const gridImages = allImages.filter(img => {
        const rect = img.getBoundingClientRect();

        // Must be visible
        if (img.offsetParent === null) return false;
        if (rect.width === 0 || rect.height === 0) return false;

        // Size check: typical CAPTCHA cells are 60-150px
        const w = rect.width;
        const h = rect.height;
        if (w < 40 || w > 200) return false;
        if (h < 40 || h > 200) return false;

        // Must be roughly square (aspect ratio between 0.7 and 1.4)
        const aspect = w / h;
        if (aspect < 0.7 || aspect > 1.4) return false;

        // Must be on screen
        if (rect.top < 0 || rect.left < 0) return false;

        // Must be clickable (has onclick, or inside table cell, or has pointer cursor)
        const style = window.getComputedStyle(img);
        const isClickable =
            img.onclick ||
            img.hasAttribute('onclick') ||
            img.closest('[onclick]') ||
            img.closest('td') ||
            style.cursor === 'pointer';

        return isClickable;
    });

    console.log(`[LoginManager] ✅ Found ${gridImages.length} grid-candidate images`);

    // Step 3: Sort by position (Row-major: Top->Bottom, Left->Right)
    gridImages.sort((a, b) => {
        const rA = a.getBoundingClientRect();
        const rB = b.getBoundingClientRect();
        // Same row if within 20px vertical
        if (Math.abs(rA.top - rB.top) > 20) return rA.top - rB.top;
        return rA.left - rB.left;
    });

    // Take first 9 (3x3 grid)
    const finalGrid = gridImages.slice(0, 9);
    console.log(`[LoginManager] 🗺️ Grid: Using ${finalGrid.length} images`);

    // Log dimensions for debugging
    if (finalGrid.length > 0) {
        const first = finalGrid[0].getBoundingClientRect();
        console.log(`[LoginManager] 📐 First image size: ${Math.round(first.width)}x${Math.round(first.height)}`);
    }

    return finalGrid;
}

/**
 * Solve Grid Captcha via DIRECT API (TURBO MODE)
 */
async function solveGridCaptcha() {
    try {
        console.log('[LoginManager] 🚀 TURBO MODE: Grid Captcha Scan...');

        // 1. Get API Key
        let apiKey = '';
        try {
            const result = await chrome.storage.local.get(['globalSettings']);
            apiKey = result.globalSettings?.captchaApiKey || '';
        } catch (e) { }

        if (!apiKey) {
            console.warn('[LoginManager] ⚠️ No API Key. Cannot solve.');
            return false;
        }

        // 2. Extract Target Number from instruction element
        let target = '';

        // Find the instruction element containing "number XXX"
        const instructionElements = document.querySelectorAll('p, span, div, label, td');
        for (const el of instructionElements) {
            const text = el.textContent?.trim() || '';
            // Must contain "select" and "number" followed by 3 digits
            const numMatch = text.match(/number\s+(\d{3})/i);
            if (text.includes('select') && numMatch) {
                target = numMatch[1];
                console.log(`[LoginManager] 🎯 Target: "${target}" (from: "${text.substring(0, 50)}...")`);
                break;
            }
        }

        if (!target) {
            // Fallback: scan body text
            const bodyText = document.body.innerText;
            const fallbackMatch = bodyText.match(/select\s+(?:all\s+)?boxes\s+with\s+number\s+(\d{3})/i);
            if (fallbackMatch) {
                target = fallbackMatch[1];
                console.log(`[LoginManager] 🎯 Target (fallback): "${target}"`);
            } else {
                console.warn('[LoginManager] ⚠️ Target number not found.');
                return false;
            }
        }

        // 3. Get Grid Images
        const gridImages = getVisualGrid();
        if (gridImages.length < 9) {
            console.warn(`[LoginManager] ⚠️ Only ${gridImages.length} images found. Proceeding anyway.`);
        }

        if (gridImages.length === 0) {
            console.error('[LoginManager] ❌ No grid images found!');
            return false;
        }

        // 4. Convert to Base64
        const processedImages = await Promise.all(gridImages.map(async img => {
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

        console.log(`[LoginManager] 📸 ${processedImages.length} images ready for API`);

        // 5. Call Background (Direct API Pipeline)
        const result = await new Promise(resolve => {
            chrome.runtime.sendMessage({
                type: 'SOLVE_CAPTCHA',
                payload: {
                    type: 'GRID',
                    images: processedImages,
                    target: target,
                    apiKey: apiKey
                }
            }, resolve);
        });

        console.log('[LoginManager] 📦 API Result:', JSON.stringify(result));

        // Handle API response - support multiple formats
        if (!result) {
            console.error('[LoginManager] ❌ No response from background!');
            return false;
        }

        // Parse matches from various response formats
        let matches = [];

        // Extract solution array - handle nested formats
        let solutionArray = null;
        if (result.matches && Array.isArray(result.matches) && result.matches.length > 0) {
            // Already has matches from background
            matches = result.matches;
            console.log(`[LoginManager] ✅ Using pre-computed matches: [${matches.join(', ')}]`);
        } else {
            // Need to extract solution and compute matches locally
            if (result.solution) {
                if (Array.isArray(result.solution)) {
                    solutionArray = result.solution;
                } else if (result.solution.text && Array.isArray(result.solution.text)) {
                    // NoCaptchaAI returns { solution: { text: [...] } }
                    solutionArray = result.solution.text;
                    console.log('[LoginManager] 📦 Extracted from solution.text');
                }
            }

            if (solutionArray) {
                console.log(`[LoginManager] 📦 OCR Results: [${solutionArray.join(', ')}]`);
                solutionArray.forEach((val, idx) => {
                    if (String(val).trim() === String(target).trim()) {
                        matches.push(idx);
                    }
                });
            }
        }

        // Error handling
        if (result.error) {
            console.error('[LoginManager] ❌ API Error:', result.error);
            return false;
        }

        if (matches.length === 0) {
            console.warn('[LoginManager] ⚠️ No matches found for target:', target);
            console.log('[LoginManager] 📦 Raw solution:', result.solution);
            console.log('[LoginManager] 📦 Raw response:', JSON.stringify(result.rawResponse));
            return false;
        }

        console.log(`[LoginManager] ✅ Matches: [${matches.join(', ')}]`);

        // 6. Click Matches (SURGICAL MODE)
        console.log(`[LoginManager] 🔬 Clicking ${matches.length} cells...`);

        for (const idx of matches) {
            const img = gridImages[idx];
            if (!img) continue;

            const target = img.closest('[onclick]') || img.closest('td') || img;

            try {
                const rect = target.getBoundingClientRect();
                const eventParams = {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: rect.left + rect.width / 2,
                    clientY: rect.top + rect.height / 2
                };

                target.dispatchEvent(new MouseEvent('mousedown', eventParams));
                await sleep(30);
                target.dispatchEvent(new MouseEvent('mouseup', eventParams));
                await sleep(10);
                target.click();

                // Green border for confirmation
                img.style.border = '3px solid #00ff00';
                img.style.boxSizing = 'border-box';

                console.log(`[LoginManager] ✅ Clicked cell ${idx}`);
            } catch (e) {
                console.warn(`[LoginManager] ⚠️ Click error cell ${idx}:`, e.message);
            }

            await sleep(60);
        }

        // 7. Wait for Submit Button
        const submitBtn = await waitForElement('input[type="submit"], button[type="submit"], #btnSubmit', 2000);
        if (submitBtn) {
            console.log('[LoginManager] ✅ Submit button ready');
        }

        return true;

    } catch (error) {
        console.error('[LoginManager] ❌ solveGridCaptcha error:', error);
        return false;
    }
}

function reset() {
    loginAttempts = 0;
    isLoggingIn = false;
}

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof globalThis !== 'undefined') {
    globalThis.AntigravityLoginManager = {
        attemptLogin,
        reset,
        getLoginFields,
        diagnoseDOM,
        solveGridCaptcha,
        humanClick  // Added for Navigator to use
    };
}

console.log('[LoginManager] Dynamic 2-Step Logic Loaded');
