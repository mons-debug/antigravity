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
        // 1. GET OR CREATE SESSION IDENTITY
        // ============================================================================

        let identity = null;

        // Try to load from sessionStorage
        try {
            const stored = sessionStorage.getItem('ag_identity');
            if (stored) {
                identity = JSON.parse(stored);
            }
        } catch (e) { /* Ignore storage errors */ }

        // Check marker to detect rotation
        let marker = null;
        try { marker = localStorage.getItem('ag_marker'); } catch (e) { }

        // Force new identity if marker missing (rotation happened)
        if (identity && !marker) {
            identity = null;
            try { sessionStorage.removeItem('ag_identity'); } catch (e) { }
        }

        // Set marker
        try { localStorage.setItem('ag_marker', 'valid'); } catch (e) { }

        // Generate new identity if needed
        if (!identity) {
            const screenWidths = [1920, 1680, 1440, 1366, 1536];
            const screenHeights = [1080, 1050, 900, 768, 864];
            const randomIdx = Math.floor(Math.random() * screenWidths.length);

            const renderers = [
                'ANGLE (NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)',
                'ANGLE (NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
                'ANGLE (Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
                'ANGLE (AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)'
            ];

            identity = {
                width: screenWidths[randomIdx],
                height: screenHeights[randomIdx],
                renderer: renderers[Math.floor(Math.random() * renderers.length)],
                hardwareConcurrency: [4, 8, 12, 16][Math.floor(Math.random() * 4)],
                deviceMemory: [4, 8, 16][Math.floor(Math.random() * 3)]
            };

            try {
                sessionStorage.setItem('ag_identity', JSON.stringify(identity));
            } catch (e) { }
        }

        // ============================================================================
        // 2. APPLY SPOOFING (Each in its own try/catch)
        // ============================================================================

        // WEBDRIVER BYPASS (Most Critical)
        try {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
                configurable: true
            });
        } catch (e) { }

        // HARDWARE CONCURRENCY
        try {
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => identity.hardwareConcurrency,
                configurable: true
            });
        } catch (e) { }

        // DEVICE MEMORY
        try {
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => identity.deviceMemory,
                configurable: true
            });
        } catch (e) { }

        // WEBGL RENDERER SPOOFING
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

        // NOTE: Screen/Window size overrides REMOVED
        // They were causing issues with page layout and BLS detection
        // The navigator properties above are sufficient for fingerprint evasion

        console.log('[Antigravity] 🎭 Stealth active (safe mode)');

    } catch (masterError) {
        // CRITICAL: Never crash the page - just log and continue
        console.warn('[Antigravity] Fingerprint script error (page continues):', masterError);
    }
})();
