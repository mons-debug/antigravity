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
        beforeType: 50 + Math.random() * 50,    // FAST: 50-100ms
        betweenChars: 20 + Math.random() * 30,  // FAST: 20-50ms/char
        afterField: 100 + Math.random() * 100,  // FAST: 100-200ms
        beforeSubmit: 100 + Math.random() * 100 // FAST: 100-200ms
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

    // SKIP if password is already correct (avoid double-typing)
    if (element.value === value) {
        console.log('[LoginManager] ⏭️ Field already has correct value, skipping...');
        return true;
    }

    // Click to focus like a human
    dispatchMouseEvent(element, 'mouseenter');
    await sleep(20);
    dispatchMouseEvent(element, 'mouseover');
    await sleep(15);
    dispatchMouseEvent(element, 'mousedown');
    await sleep(10);
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

        // FAST typing (20-50ms per char instead of 50-130ms)
        await sleep(20 + Math.random() * 30);
    }

    await sleep(50);
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

    // Minimal settling delay (just enough for DOM stability)
    const settlingDelay = 200 + Math.random() * 100;
    console.log(`[LoginManager] ⚡ Fast settling for ${Math.round(settlingDelay)}ms...`);
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
                await sleep(50 + Math.random() * 50); // Small random delay to avoid detection
                if (state.submitBtn) {
                    console.log('[LoginManager] ⚡ Fast Submit...');
                    state.submitBtn.click(); // Direct click for speed
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
 * Finds the Active Captcha Context (Target Number + Matching Images)
 * Uses robust visibility detection to avoid stale/hidden captchas.
 */
function findActiveCaptchaContext() {
    console.log('[LoginManager] 🔬 Scanning for Active Captcha Context (Robust Mode)...');

    // 1. Find all potential Instruction Text candidates via querySelectorAll 
    // This is more reliable than TreeWalker for BLS's structure
    const candidates = [];

    // Try multiple selectors that BLS might use for instruction text
    const allElements = document.querySelectorAll('span, p, div, label, td, th, font');
    const pattern = /select\s+(?:all\s+)?boxes\s+with\s+number\s+(\d{3})/i;

    for (const el of allElements) {
        // Check direct text content only (not nested elements)
        const directText = Array.from(el.childNodes)
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.nodeValue)
            .join('');

        const fullText = (el.innerText || directText || '').trim();
        const match = fullText.match(pattern);

        if (match) {
            const rect = el.getBoundingClientRect();

            // ROBUST Viewport Check: Element must be fully within visible viewport
            const inViewport = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.right <= window.innerWidth &&
                rect.width > 0 &&
                rect.height > 0
            );

            if (!inViewport) continue;

            // Check computed styles
            const style = window.getComputedStyle(el);
            if (style.display === 'none' ||
                style.visibility === 'hidden' ||
                parseFloat(style.opacity) < 0.1) {
                continue;
            }

            // Check if any ancestor is hidden
            let ancestor = el.parentElement;
            let ancestorHidden = false;
            while (ancestor && ancestor !== document.body) {
                const ancestorStyle = window.getComputedStyle(ancestor);
                if (ancestorStyle.display === 'none' ||
                    ancestorStyle.visibility === 'hidden' ||
                    parseFloat(ancestorStyle.opacity) < 0.1) {
                    ancestorHidden = true;
                    break;
                }
                ancestor = ancestor.parentElement;
            }

            if (ancestorHidden) continue;

            // Element From Point Check: Verify nothing is covering this element
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topElement = document.elementFromPoint(centerX, centerY);

            // The element at that point should be this element or a child of it
            const isOnTop = topElement === el || el.contains(topElement) || (topElement && topElement.contains(el));

            if (!isOnTop) {
                console.log(`[LoginManager] ⏭️ Skipping hidden target "${match[1]}" (covered by another element)`);
                continue;
            }

            candidates.push({
                target: match[1],
                element: el,
                y: rect.top
            });

            console.log(`[LoginManager] ✅ Found visible candidate: "${match[1]}" at Y: ${Math.round(rect.top)}px`);
        }
    }

    if (candidates.length === 0) {
        console.warn('[LoginManager] ❌ No visible target text found.');
        return null;
    }

    // 2. If multiple candidates, pick the one most likely to be the ACTIVE captcha
    // Sort by Y position - the visible captcha grid is usually below the instruction
    candidates.sort((a, b) => a.y - b.y);

    // Debug: Log all found candidates
    console.log(`[LoginManager] 📊 Found ${candidates.length} candidate(s): [${candidates.map(c => c.target).join(', ')}]`);

    // Take the LAST one (bottom-most visible instruction)
    const activeContext = candidates[candidates.length - 1];

    console.log(`[LoginManager] 🎯 Active Target: "${activeContext.target}" (Y: ${Math.round(activeContext.y)}px)`);

    // 3. Find VISIBLE Images - use same strict checks as target text
    // Don't rely on container proximity - scan ALL images and filter strictly
    console.log('[LoginManager] 🔍 Scanning for visible grid images...');

    const allImages = Array.from(document.querySelectorAll('img'));
    const visibleImages = [];

    for (const img of allImages) {
        const rect = img.getBoundingClientRect();

        // Must be reasonably sized (captcha tiles are typically 50-100px)
        if (rect.width < 40 || rect.width > 150 || rect.height < 40 || rect.height > 150) {
            continue;
        }

        // Must be in viewport
        if (rect.top < 0 || rect.bottom > window.innerHeight ||
            rect.left < 0 || rect.right > window.innerWidth) {
            continue;
        }

        // Must have offsetParent (not display:none)
        if (!img.offsetParent) {
            continue;
        }

        // Check computed styles
        const style = window.getComputedStyle(img);
        if (style.visibility === 'hidden' || parseFloat(style.opacity) < 0.5) {
            continue;
        }

        // CRITICAL: elementFromPoint check - is this image actually visible on screen?
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);

        // The element at that point should be this image or contain it
        const isVisible = topElement === img ||
            (topElement && (topElement.contains(img) || img.contains(topElement)));

        if (!isVisible) {
            continue; // Image is covered by something else
        }

        // Must be close to our instruction text (within 300px vertically)
        const distanceToInstruction = Math.abs(rect.top - activeContext.y);
        if (distanceToInstruction > 300) {
            continue;
        }

        visibleImages.push({
            img: img,
            rect: rect,
            distance: distanceToInstruction
        });
    }

    console.log(`[LoginManager] 📊 Found ${visibleImages.length} truly visible images near instruction`);

    if (visibleImages.length < 9) {
        console.warn(`[LoginManager] ⚠️ Only ${visibleImages.length} visible images found (need 9).`);
        return null;
    }

    // Sort by distance to instruction, then take closest 9
    visibleImages.sort((a, b) => a.distance - b.distance);
    let selectedImages = visibleImages.slice(0, 9).map(v => v.img);

    // 4. Sort Images Geometrically (Top-Left to Bottom-Right) with ROBUST row detection
    // First, get all rects and find row boundaries
    const imageRects = selectedImages.map(img => ({
        img: img,
        rect: img.getBoundingClientRect()
    }));

    // Sort by Y position first to find row boundaries
    imageRects.sort((a, b) => a.rect.top - b.rect.top);

    // Group into rows (images within 25px of each other are same row)
    const rows = [];
    let currentRow = [imageRects[0]];

    for (let i = 1; i < imageRects.length; i++) {
        const prevTop = currentRow[0].rect.top;
        const currTop = imageRects[i].rect.top;

        if (Math.abs(currTop - prevTop) <= 25) {
            // Same row
            currentRow.push(imageRects[i]);
        } else {
            // New row
            rows.push(currentRow);
            currentRow = [imageRects[i]];
        }
    }
    rows.push(currentRow); // Don't forget last row

    // Sort each row by X position (left to right)
    rows.forEach(row => row.sort((a, b) => a.rect.left - b.rect.left));

    // Flatten back to array in correct order
    const sortedImages = rows.flat().map(item => item.img);

    // Log grid positions for debugging
    console.log('[LoginManager] 📐 Grid layout:');
    sortedImages.forEach((img, idx) => {
        const rect = img.getBoundingClientRect();
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        console.log(`  Cell ${idx} (Row${row}, Col${col}): X=${Math.round(rect.left)}, Y=${Math.round(rect.top)}`);
    });

    console.log('[LoginManager] ✅ Selected 9 visible images for captcha');

    return {
        target: activeContext.target,
        images: sortedImages
    };
}

/**
 * Solve Grid Captcha using Context-Aware Detection
 * Finds the active captcha (target + images together) to avoid ghost captchas
 */
async function solveGridCaptcha() {
    try {
        console.log('[LoginManager] 🚀 Context-Aware Captcha Solving...');

        // 1. Get Context (Target + Images)
        const context = findActiveCaptchaContext();

        if (!context) {
            console.error('[LoginManager] ❌ Could not determine active captcha context.');
            return false;
        }

        const { target, images } = context;

        // Note: We no longer apply preview borders to all 9 images
        // Only the matched/clicked cells will get borders after API response

        // 3. Convert to Base64 with HIGH QUALITY for accurate OCR
        console.log('[LoginManager] 📸 Capturing 9 images (high quality)...');
        const processedImages = await Promise.all(images.map(async (img, index) => {
            try {
                // Wait for image to be fully loaded
                if (!img.complete) {
                    await new Promise(resolve => {
                        img.onload = resolve;
                        setTimeout(resolve, 500); // Max 500ms wait
                    });
                }

                // Use rendered size if natural size is not available
                const width = img.naturalWidth || img.width || img.getBoundingClientRect().width || 100;
                const height = img.naturalHeight || img.height || img.getBoundingClientRect().height || 100;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Draw with high quality
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);

                // Use PNG for best quality (lossless)
                const dataUrl = canvas.toDataURL('image/png');
                console.log(`[LoginManager] 📷 Image ${index}: ${width}x${height}px`);
                return dataUrl.split(',')[1];
            } catch (e) {
                console.error(`[LoginManager] ❌ Failed to capture image ${index}:`, e);
                return null;
            }
        }));

        if (processedImages.some(img => !img)) {
            console.error('[LoginManager] ❌ Failed to capture some images');
            return false;
        }

        // 4. Get API Key from storage
        let apiKey = '';
        try {
            const result = await chrome.storage.local.get(['globalSettings']);
            apiKey = result.globalSettings?.captchaApiKey || '';
        } catch (e) {
            console.warn('[LoginManager] ⚠️ Could not get API key from storage');
        }

        if (!apiKey) {
            console.error('[LoginManager] ❌ No API Key configured. Please set it in extension settings.');
            return false;
        }

        // 5. Send to API (Direct Pipeline)
        const response = await chrome.runtime.sendMessage({
            type: 'SOLVE_CAPTCHA',
            payload: {
                type: 'GRID',
                images: processedImages,
                target: target,
                apiKey: apiKey
            }
        });

        console.log('[LoginManager] 📦 API Response:', response);

        // 5. Handle Matches
        if (!response || !response.success) {
            console.error('[LoginManager] ❌ API Failed:', response?.error);
            return false;
        }

        const matches = response.matches || [];
        console.log(`[LoginManager] ✅ Clicking ${matches.length} matches:`, matches);

        if (matches.length === 0) {
            console.warn('[LoginManager] ⚠️ API found 0 matches. Retrying...');
            return false;
        }

        // FAST CLICK with minimal random delay to avoid detection
        console.log(`[LoginManager] ⚡ Fast clicking ${matches.length} cells:`, matches);

        for (const idx of matches) {
            const img = images[idx];
            if (img) {
                // Green border for visual feedback
                img.style.border = "3px solid #00ff00";
                img.style.boxSizing = "border-box";

                // Direct click with tiny random delay to avoid detection
                const clickTarget = img.closest('[onclick]') || img;
                clickTarget.click();
                await sleep(10 + Math.random() * 20); // 10-30ms anti-detection delay
            }
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
