/**
 * Antigravity Operator - Captcha Service (Agent E)
 * 
 * Handles CAPTCHA solving via external APIs.
 * Supports NoCaptchaAI, 2Captcha, CapSolver, Anti-Captcha.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CAPTCHA_CONFIG = {
    providers: {
        nocaptchaai: {
            name: 'NoCaptchaAI',
            endpoint: 'https://api.nocaptchaai.com/solve',
            method: 'POST'
        },
        '2captcha': {
            name: '2Captcha',
            submitEndpoint: 'https://2captcha.com/in.php',
            resultEndpoint: 'https://2captcha.com/res.php',
            pollInterval: 5000,
            maxPolls: 24 // 2 minutes max
        },
        anticaptcha: {
            name: 'Anti-Captcha',
            endpoint: 'https://api.anti-captcha.com/createTask'
        },
        capsolver: {
            name: 'CapSolver',
            endpoint: 'https://api.capsolver.com/createTask'
        },
        gpt4vision: {
            name: 'GPT-4 Vision',
            endpoint: null // Uses local OpenAI integration
        }
    },
    timeout: 120000 // 2 minutes
};

// ============================================================================
// SETTINGS RETRIEVAL
// ============================================================================

/**
 * Gets CAPTCHA settings from storage
 */
async function getSettings() {
    try {
        const result = await chrome.storage.local.get(['globalSettings']);
        return {
            provider: result.globalSettings?.captchaProvider || 'nocaptchaai',
            apiKey: result.globalSettings?.captchaApiKey || ''
        };
    } catch (error) {
        console.error('[CaptchaService] Failed to get settings:', error);
        return { provider: 'nocaptchaai', apiKey: '' };
    }
}

// ============================================================================
// MAIN SOLVE FUNCTION
// ============================================================================

/**
 * Solves a CAPTCHA image using the configured provider.
 * 
 * @param {string} base64Image - Base64 encoded image (with or without data: prefix)
 * @returns {Promise<Object>} Result with solution or error
 */
async function solveCaptcha(base64Image) {
    console.log('[CaptchaService] 🧩 Starting CAPTCHA solve...');

    const settings = await getSettings();

    if (!settings.apiKey) {
        console.error('[CaptchaService] No API key configured');
        return { success: false, error: 'NO_API_KEY' };
    }

    // Clean base64 (remove data:image/xxx prefix if present)
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');

    try {
        switch (settings.provider) {
            case 'nocaptchaai':
                return await solveWithNoCaptchaAI(cleanBase64, settings.apiKey);

            case '2captcha':
                return await solveWith2Captcha(cleanBase64, settings.apiKey);

            case 'anticaptcha':
                return await solveWithAntiCaptcha(cleanBase64, settings.apiKey);

            case 'capsolver':
                return await solveWithCapSolver(cleanBase64, settings.apiKey);

            case 'gpt4vision':
                return await solveWithGPT4Vision(cleanBase64, settings.apiKey);

            default:
                return { success: false, error: 'UNKNOWN_PROVIDER' };
        }
    } catch (error) {
        console.error('[CaptchaService] ❌ Solve error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

/**
 * Solves CAPTCHA using NoCaptchaAI
 */
async function solveWithNoCaptchaAI(base64Image, apiKey) {
    console.log('[CaptchaService] Using NoCaptchaAI...');

    const response = await fetch(CAPTCHA_CONFIG.providers.nocaptchaai.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
        },
        body: JSON.stringify({
            method: 'ocr',
            image: base64Image
        })
    });

    const result = await response.json();

    if (result.status === 'solved' || result.solution) {
        console.log('[CaptchaService] ✅ NoCaptchaAI solved:', result.solution);
        return { success: true, solution: result.solution };
    } else {
        console.error('[CaptchaService] NoCaptchaAI failed:', result);
        return { success: false, error: result.message || 'SOLVE_FAILED' };
    }
}

/**
 * Solves CAPTCHA using 2Captcha
 */
async function solveWith2Captcha(base64Image, apiKey) {
    console.log('[CaptchaService] Using 2Captcha...');

    const config = CAPTCHA_CONFIG.providers['2captcha'];

    // Step 1: Submit the CAPTCHA
    const submitUrl = `${config.submitEndpoint}?key=${apiKey}&method=base64&body=${encodeURIComponent(base64Image)}&json=1`;

    const submitResponse = await fetch(submitUrl, { method: 'POST' });
    const submitResult = await submitResponse.json();

    if (submitResult.status !== 1) {
        console.error('[CaptchaService] 2Captcha submit failed:', submitResult);
        return { success: false, error: submitResult.request || 'SUBMIT_FAILED' };
    }

    const captchaId = submitResult.request;
    console.log('[CaptchaService] 2Captcha ID:', captchaId);

    // Step 2: Poll for result
    const resultUrl = `${config.resultEndpoint}?key=${apiKey}&action=get&id=${captchaId}&json=1`;

    for (let i = 0; i < config.maxPolls; i++) {
        await sleep(config.pollInterval);

        const resultResponse = await fetch(resultUrl);
        const result = await resultResponse.json();

        if (result.status === 1) {
            console.log('[CaptchaService] ✅ 2Captcha solved:', result.request);
            return { success: true, solution: result.request };
        } else if (result.request !== 'CAPCHA_NOT_READY') {
            console.error('[CaptchaService] 2Captcha error:', result);
            return { success: false, error: result.request };
        }

        console.log(`[CaptchaService] 2Captcha polling... (${i + 1}/${config.maxPolls})`);
    }

    return { success: false, error: 'TIMEOUT' };
}

/**
 * Solves CAPTCHA using Anti-Captcha
 */
async function solveWithAntiCaptcha(base64Image, apiKey) {
    console.log('[CaptchaService] Using Anti-Captcha...');

    // Create task
    const createResponse = await fetch(CAPTCHA_CONFIG.providers.anticaptcha.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientKey: apiKey,
            task: {
                type: 'ImageToTextTask',
                body: base64Image
            }
        })
    });

    const createResult = await createResponse.json();

    if (createResult.errorId !== 0) {
        return { success: false, error: createResult.errorDescription };
    }

    const taskId = createResult.taskId;

    // Poll for result
    const getResultUrl = 'https://api.anti-captcha.com/getTaskResult';

    for (let i = 0; i < 24; i++) {
        await sleep(5000);

        const resultResponse = await fetch(getResultUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientKey: apiKey, taskId })
        });

        const result = await resultResponse.json();

        if (result.status === 'ready') {
            console.log('[CaptchaService] ✅ Anti-Captcha solved:', result.solution.text);
            return { success: true, solution: result.solution.text };
        } else if (result.errorId !== 0) {
            return { success: false, error: result.errorDescription };
        }
    }

    return { success: false, error: 'TIMEOUT' };
}

/**
 * Solves CAPTCHA using CapSolver
 */
async function solveWithCapSolver(base64Image, apiKey) {
    console.log('[CaptchaService] Using CapSolver...');

    // Create task
    const response = await fetch(CAPTCHA_CONFIG.providers.capsolver.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientKey: apiKey,
            task: {
                type: 'ImageToTextTask',
                body: base64Image
            }
        })
    });

    const result = await response.json();

    if (result.errorId === 0 && result.solution) {
        console.log('[CaptchaService] ✅ CapSolver solved:', result.solution.text);
        return { success: true, solution: result.solution.text };
    }

    if (result.taskId) {
        // Poll for result
        for (let i = 0; i < 24; i++) {
            await sleep(5000);

            const resultResponse = await fetch('https://api.capsolver.com/getTaskResult', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientKey: apiKey, taskId: result.taskId })
            });

            const pollResult = await resultResponse.json();

            if (pollResult.status === 'ready') {
                return { success: true, solution: pollResult.solution.text };
            }
        }
    }

    return { success: false, error: result.errorDescription || 'SOLVE_FAILED' };
}

/**
 * Solves CAPTCHA using GPT-4 Vision (OpenAI API)
 */
async function solveWithGPT4Vision(base64Image, apiKey) {
    console.log('[CaptchaService] Using GPT-4 Vision...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'This is a CAPTCHA image. Return ONLY the text/numbers shown in the image, nothing else. No explanation, no formatting, just the raw captcha text.'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 50
        })
    });

    const result = await response.json();

    if (result.choices?.[0]?.message?.content) {
        const solution = result.choices[0].message.content.trim();
        console.log('[CaptchaService] ✅ GPT-4 Vision solved:', solution);
        return { success: true, solution };
    }

    return { success: false, error: result.error?.message || 'GPT_FAILED' };
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gets the current status of the service
 */
async function getStatus() {
    const settings = await getSettings();
    return {
        provider: settings.provider,
        hasApiKey: !!settings.apiKey,
        providerName: CAPTCHA_CONFIG.providers[settings.provider]?.name || 'Unknown'
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const CaptchaService = {
    solveCaptcha,
    getSettings,
    getStatus,
    CAPTCHA_CONFIG
};

console.log('[CaptchaService] Agent E loaded');
