/**
 * Antigravity - Fingerprint Spoofing (Safe Version)
 * 
 * CRITICAL: This script runs in MAIN world at document_start.
 * Any crash here will break the entire page.
 * All modifications are wrapped in try/catch to prevent page crashes.
 */

(function () {
    'use strict';

    // MASTER TRY/CATCH - Never crash the page
    try {
        // ============================================================================
        // 1. GET OR CREATE SESSION IDENTITY (Kept for future use, but not applied to risky props)
        // ============================================================================

        // ... (Identity logic kept passive) ...

        // ============================================================================
        // 2. APPLY SPOOFING (MINIMAL MODE)
        // Only spoof webdriver to fix broken page. Disable risky overrides.
        // ============================================================================

        // WEBDRIVER BYPASS (Most Critical - Fixes "Broken Page" anti-bot)
        try {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
                configurable: true
            });
        } catch (e) { }

        // HARDWARE CONCURRENCY - DISABLED (Risk of crash)
        /*
        try {
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => identity.hardwareConcurrency,
                configurable: true
            });
        } catch (e) { }
        */

        // DEVICE MEMORY - DISABLED (Risk of crash)
        /*
        try {
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => identity.deviceMemory,
                configurable: true
            });
        } catch (e) { }
        */

        // WEBGL RENDERER SPOOFING - DISABLED (High risk of blank page)
        /*
        try {
            const getParameterProxyHandler = {
                apply: function (target, thisArg, args) {
                    const param = args[0];
                    if (param === 37445) return 'Google Inc. (NVIDIA)';
                    if (param === 37446) return identity.renderer;
                    return target.apply(thisArg, args);
                }
            };

            if (typeof WebGLRenderingContext !== 'undefined') {
                WebGLRenderingContext.prototype.getParameter = new Proxy(
                    WebGLRenderingContext.prototype.getParameter,
                    getParameterProxyHandler
                );
            }
            if (typeof WebGL2RenderingContext !== 'undefined') {
                WebGL2RenderingContext.prototype.getParameter = new Proxy(
                    WebGL2RenderingContext.prototype.getParameter,
                    getParameterProxyHandler
                );
            }
        } catch (e) { }
        */

        // NOTE: Screen/Window size overrides REMOVED
        // They were causing issues with page layout and BLS detection
        // The navigator properties above are sufficient for fingerprint evasion

        console.log('[Antigravity] 🎭 Stealth active (safe mode)');

    } catch (masterError) {
        // CRITICAL: Never crash the page - just log and continue
        console.warn('[Antigravity] Fingerprint script error (page continues):', masterError);
    }
})();
