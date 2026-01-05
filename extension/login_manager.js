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
 * Wait for session stability after Nuclear Rotation to prevent captcha loops.
 * Waits for document to be fully loaded plus a random settling delay.
 * Also waits for login form elements to appear in DOM.
 */
async function waitForStability() {
    console.log('[LoginManager] ⏳ Waiting for session stability...');

    // Wait for document readyState to be complete
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            const checkReady = () => {
                if (document.readyState === 'complete') {
                    window.removeEventListener('load', checkReady);
                    resolve();
                }
            };
            window.addEventListener('load', checkReady);
            // Fallback timeout
            setTimeout(resolve, 5000);
        });
    }

    // CRITICAL: Wait for login form elements to appear
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

    // Additional random settling delay (1000ms - 2000ms)
    const settlingDelay = 1000 + Math.random() * 1000;
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
 * Extract the 9 visible grid images using spatial mapping and z-index winner logic.
 * BLS stacks multiple images at the same position - we only want the top one.
 */
function getVisualGrid() {
    // Find the captcha container (look for common patterns)
    const container = document.querySelector('.captcha-container, #captcha, [class*="captcha"], table') || document.body;
    const allImages = Array.from(container.querySelectorAll('img'));

    // Group images by their visual position
    const positionMap = new Map();

    // Scroll into view first to encourage lazy loading if needed
    try {
        container.scrollIntoView({ behavior: 'instant', block: 'center' });
    } catch (e) { }

    allImages.forEach(img => {
        // Relaxed constraints
        if (img.width < 30 || img.height < 30) return; // Was 40
        if (img.width > 300 || img.height > 300) return; // Was 200

        // Skip hidden functionality (display:none)
        if (img.offsetParent === null) return;

        // Relaxed aspect ratio
        const aspectRatio = img.width / img.height;
        if (aspectRatio < 0.4 || aspectRatio > 2.5) return;

        const rect = img.getBoundingClientRect();
        // REMOVED: strict viewport check which caused "missing grids" on scroll
        // if (rect.top < 0 || rect.left < 0) return; 

        // Use tighter grouping (5px instead of 10px)
        const key = `${Math.round(rect.left / 5) * 5}-${Math.round(rect.top / 5) * 5}`;

        const zIndex = getEffectiveZIndex(img);

        if (!positionMap.has(key)) {
            positionMap.set(key, { img, zIndex, rect });
        } else {
            // Keep the one with higher z-index (visible on top)
            if (zIndex > positionMap.get(key).zIndex) {
                positionMap.set(key, { img, zIndex, rect });
            }
        }
    });

    // Extract the winners (one per position)
    const winners = Array.from(positionMap.values());

    // Sort by position: top (row) first, then left (column)
    winners.sort((a, b) => {
        // Row-major order (25px tolerance for same row)
        if (Math.abs(a.rect.top - b.rect.top) > 25) {
            return a.rect.top - b.rect.top;
        }
        return a.rect.left - b.rect.left;
    });

    // Take exactly 9 images (the grid), ignore extras
    const orderedImages = winners.slice(0, 9).map(w => w.img);

    console.log(`[LoginManager] 🗺️ Reconstructed grid: ${winners.length} found, using first 9.`);

    return orderedImages;
}

/**
 * Solve Grid Captcha via Server (with Spatial Mapping)
 */
async function solveGridCaptcha() {
    try {
        console.log('[LoginManager] 🧩 Starting Grid Captcha Scan...');

        // ================================================================
        // 0. SMART WAIT - Ensure page is fully loaded before solving
        // ================================================================
        console.log('[LoginManager] ⏳ Waiting for page to fully load...');

        const maxWaitMs = 5000; // Max 5 seconds
        const startWait = Date.now();

        while (Date.now() - startWait < maxWaitMs) {
            const hasInstruction = document.body.innerText.match(/select.*boxes.*number\s*\d{3}/i) ||
                document.body.innerText.match(/Please select/i);
            const gridImages = Array.from(document.querySelectorAll('img')).filter(img => {
                const rect = img.getBoundingClientRect();
                return rect.width >= 50 && rect.width <= 200 && rect.height >= 50 && rect.height <= 200;
            });
            const imagesLoaded = gridImages.length >= 9 && gridImages.every(img => img.complete);

            if (hasInstruction && imagesLoaded) {
                console.log(`[LoginManager] ✅ Page ready in ${Date.now() - startWait}ms`);
                break;
            }

            console.log(`[LoginManager] ⏳ Waiting... (instruction: ${!!hasInstruction}, images: ${gridImages.length}/9)`);
            await sleep(200);
        }

        // 1. Get Settings (API Key)
        let settings = { apiKey: '' };
        try {
            const result = await chrome.storage.local.get(['globalSettings']);
            settings.apiKey = result.globalSettings?.captchaApiKey || '';
        } catch (e) { console.error('Error getting settings:', e); }

        if (!settings.apiKey) {
            console.warn('[LoginManager] ⚠️ No API Key found in settings. Cannot auto-solve grid.');
            return false;
        }

        // ================================================================
        // 2. EXTRACT TARGET NUMBER (Proximity-Based Approach)
        // Find CAPTCHA grid FIRST, then look for instruction ABOVE it
        // ================================================================

        // Step 2a: Find the CAPTCHA grid images to get their position
        const captchaImgs = Array.from(document.querySelectorAll('img')).filter(img => {
            const rect = img.getBoundingClientRect();
            return rect.width >= 50 && rect.width <= 200 &&
                rect.height >= 50 && rect.height <= 200 &&
                (img.onclick || img.closest('[onclick]') || img.src.toLowerCase().includes('cap'));
        });

        let gridTopY = 0;
        if (captchaImgs.length > 0) {
            gridTopY = Math.min(...captchaImgs.map(img => img.getBoundingClientRect().top));
            console.log(`[LoginManager] 📍 CAPTCHA grid top position: ${gridTopY}px`);
        }

        // Step 2b: Search for instruction text ABOVE the grid
        const textSelectors = ['p', 'span', 'div', 'h3', 'h4', 'h5', 'label', 'b', 'strong'];
        const candidates = [];

        for (const selector of textSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // Visibility checks
                if (!el.offsetParent) continue;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') continue;
                if (parseFloat(style.opacity) === 0) continue;

                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;

                // Must be ABOVE the grid (within 400px)
                if (gridTopY > 0 && (rect.bottom > gridTopY || rect.top < gridTopY - 400)) continue;

                const text = el.textContent || '';

                // Match instruction pattern
                const match = text.match(/Please\s+select\s+(?:all\s+)?boxes\s+with\s+number\s+(\d{3})/i);
                if (match) {
                    candidates.push({
                        number: match[1],
                        y: rect.top,
                        zIndex: style.zIndex || '0',
                        text: text.substring(0, 60)
                    });
                }
            }
        }

        let target = '';

        if (candidates.length > 0) {
            // Sort by Y-position descending (closest to grid wins), then by z-index
            candidates.sort((a, b) => {
                if (Math.abs(a.y - b.y) < 5) {
                    return (parseInt(b.zIndex) || 0) - (parseInt(a.zIndex) || 0);
                }
                return b.y - a.y; // Higher Y = closer to grid = wins
            });

            target = candidates[0].number;
            console.log(`[LoginManager] 🎯 Found target via proximity: "${target}" from "${candidates[0].text}..."`);
            console.log(`[LoginManager] 📊 Total candidates found: ${candidates.length}`);
        }

        // Fallback: Check specific captcha-related selectors
        if (!target) {
            console.log('[LoginManager] 📝 Falling back to captcha-specific selectors...');
            const fallbackSelectors = [
                '.captcha-div', '.box-label', '[class*="captcha"]',
                '#captcha', '.captcha-instruction', '.instruction-text'
            ];

            for (const selector of fallbackSelectors) {
                const el = document.querySelector(selector);
                if (el) {
                    const match = el.textContent.match(/(\d{3})/);
                    if (match) {
                        target = match[1];
                        console.log(`[LoginManager] 🎯 Found target in ${selector}: "${target}"`);
                        break;
                    }
                }
            }
        }

        // Last resort: body text with strict pattern
        if (!target) {
            console.log('[LoginManager] 📝 Last resort: body text search...');
            const bodyText = document.body.innerText;
            const match = bodyText.match(/select\s+(?:all\s+)?boxes\s+with\s+number\s+(\d{3})/i);
            if (match) {
                target = match[1];
                console.log(`[LoginManager] 🎯 Final target number: "${target}"`);
            }
        }

        if (!target) {
            console.warn('[LoginManager] ⚠️ Could not find target number. Aborting.');
            return false;
        }

        // ================================================================
        // 3. CAPTURE & PROCESS IMAGES (Spatial Clustering)
        // Find the 3x3 grid structure to exclude logos/icons
        // ================================================================

        // Helper: get center of element
        const getCenter = (rect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

        // Helper: check if two images are "aligned" (in same grid system)
        const isAligned = (r1, r2) => {
            const verticalDist = Math.abs(r1.top - r2.top);
            const horizontalDist = Math.abs(r1.left - r2.left);
            const sizeDiff = Math.abs(r1.width - r2.width) + Math.abs(r1.height - r2.height);

            // Should be roughly same size
            if (sizeDiff > 20) return false;

            // Should be either same row (small vertical diff) or same column (small horizontal diff)
            // AND within reasonable distance (grid gap is usually small)
            return (verticalDist < 20 && horizontalDist < 250) || (horizontalDist < 20 && verticalDist < 250);
        };

        // Find clusters
        const clusters = [];
        const processed = new Set();

        // Sort by Y first
        captchaImgs.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

        for (let i = 0; i < captchaImgs.length; i++) {
            if (processed.has(i)) continue;
            const currentCluster = [captchaImgs[i]];
            processed.add(i);
            const r1 = captchaImgs[i].getBoundingClientRect();

            for (let j = i + 1; j < captchaImgs.length; j++) {
                if (processed.has(j)) continue;
                const r2 = captchaImgs[j].getBoundingClientRect();

                if (isAligned(r1, r2)) {
                    currentCluster.push(captchaImgs[j]);
                    processed.add(j);
                }
            }
            if (currentCluster.length >= 9) clusters.push(currentCluster);
        }

        // Pick the best cluster (closest to 9 images, centered, most "grid-like")
        let bestCluster = clusters.sort((a, b) => {
            // Prefer exact 9
            const diffA = Math.abs(a.length - 9);
            const diffB = Math.abs(b.length - 9);
            if (diffA !== diffB) return diffA - diffB;
            return 0;
        })[0];

        // Fallback: if no cluster found, use naive list
        let finalGridImages = bestCluster ? bestCluster.slice(0, 9) : captchaImgs.slice(0, 9);

        // Re-sort the final grid (Row-major order: Top->Bottom, Left->Right)
        finalGridImages.sort((a, b) => {
            const rA = a.getBoundingClientRect();
            const rB = b.getBoundingClientRect();
            // Fuzzy row check (allow 10px variance)
            if (Math.abs(rA.top - rB.top) > 15) {
                return rA.top - rB.top;
            }
            return rA.left - rB.left;
        });

        console.log(`[LoginManager] 🗺️ Reconstructed grid: ${finalGridImages.length} images selected.`);

        // Convert key images for solving
        const processedImages = await Promise.all(finalGridImages.map(async img => {
            // Highlight for debug check
            // try { img.style.outline = '2px dashed blue'; } catch(e){}
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                return canvas.toDataURL('image/png');
            } catch (e) {
                console.warn('[LoginManager] Canvas error, falling back to src');
                return img.src;
            }
        }));

        console.log(`[LoginManager] 📸 Images converted in ${Date.now() - startWait}ms`);

        // Use the SORTED images for clicking later
        let gridImages = finalGridImages;

        // 5. Send to Server with Timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        let response;
        try {
            response = await fetch('http://localhost:3000/solve-grid-captcha', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    images: processedImages,
                    target: target,
                    apiKey: settings.apiKey
                }),
                signal: controller.signal
            });
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('[LoginManager] ❌ IDP Fetch Error (Timeout/Network):', err);
            return false;
        }
        clearTimeout(timeoutId);

        // 🚨 HANDLE BANS (430 / 403 / 429)
        if (response.status === 430 || response.status === 403 || response.status === 429) {
            console.error('[LoginManager] 🚨 IP BANNED! Status:', response.status);
            chrome.runtime.sendMessage({
                type: 'ROTATE_PROXY',
                reloadTab: true,
                reason: 'IP_BANNED_' + response.status
            }).catch(() => { });
            return false;
        }

        const result = await response.json();

        // ERROR HANDLING (Guard Clause)
        if (!result.success || !result.matches) {
            console.error('[LoginManager] Server failed to solve:', result.error || 'Unknown error');
            return false;
        }

        console.log('[LoginManager] ✅ Server returned matches:', result.matches);

        // CRITICAL: Abort if no matches
        if (result.matches.length === 0) {
            console.warn('[LoginManager] ⚠️ AI found 0 matches. Aborting submit.');
            return false;
        }

        // 6. Click Matches
        console.log(`[LoginManager] ⚡ Clicking ${result.matches.length} matches...`);

        for (const idx of result.matches) {
            const img = gridImages[idx];
            if (img) {
                console.log(`[LoginManager] 👆 Clicking cell ${idx}`);

                // Find clickable element
                let clickTarget = img;
                const parent = img.parentElement;
                const grandparent = parent?.parentElement;

                if (parent && (parent.onclick || parent.getAttribute('onclick'))) {
                    clickTarget = parent;
                } else if (grandparent && (grandparent.onclick || grandparent.getAttribute('onclick'))) {
                    clickTarget = grandparent;
                } else if (img.closest('[onclick]')) {
                    clickTarget = img.closest('[onclick]');
                }

                await humanClick(clickTarget);

                // Visual Feedback
                try {
                    img.style.border = '4px solid #00ff00';
                    img.style.boxSizing = 'border-box';
                    if (clickTarget !== img) clickTarget.style.border = '2px solid #00ff00';
                } catch (e) { }

                // Dispatch Events
                try {
                    const events = ['change', 'input'];
                    events.forEach(evt => {
                        try { clickTarget.dispatchEvent(new Event(evt, { bubbles: true })); } catch (e) { }
                    });
                } catch (e) { }

                await sleep(100 + Math.random() * 50);
            }
        }

        // Safety Pause
        const safetyPause = 1000 + Math.random() * 1000;
        console.log(`[LoginManager] 💤 Safety pause ${Math.round(safetyPause)}ms before submit...`);
        await sleep(safetyPause);

        console.log(`[LoginManager] ✅ Clicked all ${result.matches.length} matches!`);
        return true;

    } catch (error) {
        console.error('[LoginManager] Error in solveGridCaptcha:', error);
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
