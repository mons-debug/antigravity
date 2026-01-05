/**
 * Antigravity Operator - Stealth Module
 * 
 * Handles fingerprint spoofing and user-agent rotation to evade detection.
 * Injects anti-fingerprinting code into pages to appear as different browsers.
 */

// ============================================================================
// USER-AGENT POOL (Rotated on each proxy change)
// ============================================================================

const USER_AGENTS = [
    // Windows Chrome
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    // Windows Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
    // Windows Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    // Mac Chrome
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    // Mac Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    // Mac Firefox
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"
];

// ============================================================================
// SCREEN RESOLUTIONS (Randomized)
// ============================================================================

const SCREEN_RESOLUTIONS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 2560, height: 1440 },
    { width: 1680, height: 1050 }
];

// ============================================================================
// STEALTH MANAGER
// ============================================================================

const StealthManager = {
    currentUserAgent: null,
    currentScreen: null,

    /**
     * Initialize stealth with random identity
     */
    async init() {
        await this.rotateIdentity();
        console.log('[Stealth] 🎭 Stealth module initialized');
    },

    /**
     * Rotate to a new random identity
     */
    async rotateIdentity() {
        // Pick random user agent
        this.currentUserAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        this.currentScreen = SCREEN_RESOLUTIONS[Math.floor(Math.random() * SCREEN_RESOLUTIONS.length)];

        // Store for content scripts
        await chrome.storage.session.set({
            stealthIdentity: {
                userAgent: this.currentUserAgent,
                screen: this.currentScreen,
                timestamp: Date.now()
            }
        });

        console.log('[Stealth] 🔄 New identity:', this.currentUserAgent.substring(0, 50) + '...');

        // Update declarativeNetRequest rules for User-Agent header
        await this.updateUserAgentRule();

        return {
            userAgent: this.currentUserAgent,
            screen: this.currentScreen
        };
    },

    /**
     * Update User-Agent header via declarativeNetRequest
     * NOTE: DISABLED - This was causing page loading issues on BLS
     * The client-side fingerprint spoofing is sufficient for detection evasion
     */
    async updateUserAgentRule() {
        // DISABLED: declarativeNetRequest UA modification was breaking page loading
        console.log('[Stealth] 📝 User-Agent modification DISABLED (using client-side only)');

        // Clear any existing rules that might be interfering
        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [1]
            });
        } catch (err) {
            // Ignore errors
        }

        return; // Skip UA modification
    },

    /**
     * Get fingerprint spoofing script to inject into page
     */
    getFingerprintScript() {
        const screen = this.currentScreen || { width: 1920, height: 1080 };

        return `
        (function() {
            'use strict';
            
            // ========================================
            // CANVAS FINGERPRINT SPOOFING
            // ========================================
            const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
            const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
            
            HTMLCanvasElement.prototype.toDataURL = function(type) {
                // Add random noise to canvas before export
                const ctx = this.getContext('2d');
                if (ctx) {
                    const imageData = originalGetImageData.call(ctx, 0, 0, this.width, this.height);
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        // Add tiny random noise (imperceptible but changes hash)
                        imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + (Math.random() * 2 - 1)));
                    }
                    ctx.putImageData(imageData, 0, 0);
                }
                return originalToDataURL.apply(this, arguments);
            };
            
            // ========================================
            // WEBGL FINGERPRINT SPOOFING
            // ========================================
            const getParameterProxyHandler = {
                apply: function(target, thisArg, args) {
                    const param = args[0];
                    const gl = thisArg;
                    
                    // Randomize WebGL renderer/vendor
                    if (param === 37445) { // UNMASKED_VENDOR_WEBGL
                        return 'Google Inc. (NVIDIA)';
                    }
                    if (param === 37446) { // UNMASKED_RENDERER_WEBGL
                        const renderers = [
                            'ANGLE (NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)',
                            'ANGLE (NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
                            'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
                            'ANGLE (AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)'
                        ];
                        return renderers[Math.floor(Math.random() * renderers.length)];
                    }
                    
                    return target.apply(thisArg, args);
                }
            };
            
            // Override WebGL getParameter
            const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = new Proxy(originalGetParameter, getParameterProxyHandler);
            
            if (typeof WebGL2RenderingContext !== 'undefined') {
                const originalGetParameter2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = new Proxy(originalGetParameter2, getParameterProxyHandler);
            }
            
            // ========================================
            // SCREEN RESOLUTION SPOOFING
            // ========================================
            Object.defineProperty(window.screen, 'width', { get: () => ${screen.width} });
            Object.defineProperty(window.screen, 'height', { get: () => ${screen.height} });
            Object.defineProperty(window.screen, 'availWidth', { get: () => ${screen.width} });
            Object.defineProperty(window.screen, 'availHeight', { get: () => ${screen.height - 40} });
            Object.defineProperty(window, 'innerWidth', { get: () => ${screen.width} });
            Object.defineProperty(window, 'innerHeight', { get: () => ${screen.height - 140} });
            Object.defineProperty(window, 'outerWidth', { get: () => ${screen.width} });
            Object.defineProperty(window, 'outerHeight', { get: () => ${screen.height} });
            
            // ========================================
            // TIMEZONE RANDOMIZATION
            // ========================================
            const timezones = ['Europe/London', 'Europe/Paris', 'Europe/Madrid', 'Europe/Berlin'];
            const randomTZ = timezones[Math.floor(Math.random() * timezones.length)];
            
            // ========================================
            // HARDWARE CONCURRENCY SPOOFING
            // ========================================
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => [4, 8, 12, 16][Math.floor(Math.random() * 4)] });
            
            // ========================================
            // DEVICE MEMORY SPOOFING
            // ========================================
            Object.defineProperty(navigator, 'deviceMemory', { get: () => [4, 8, 16][Math.floor(Math.random() * 3)] });
            
            // ========================================
            // PLUGINS SPOOFING (Appear as normal browser)
            // ========================================
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    return {
                        length: 3,
                        item: (i) => null,
                        namedItem: (n) => null,
                        refresh: () => {}
                    };
                }
            });
            
            // ========================================
            // WEBDRIVER DETECTION BYPASS
            // ========================================
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            delete navigator.__proto__.webdriver;
            
            console.log('[Stealth] 🎭 Fingerprint spoofing active');
        })();
        `;
    },

    /**
     * Get current identity
     */
    getCurrentIdentity() {
        return {
            userAgent: this.currentUserAgent,
            screen: this.currentScreen
        };
    }
};

// Export for background script
export { StealthManager, USER_AGENTS, SCREEN_RESOLUTIONS };

// Also attach to global for service worker
if (typeof self !== 'undefined') {
    self.StealthManager = StealthManager;
}

console.log('[Stealth] Module loaded');
