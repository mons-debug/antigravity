(function () {
    'use strict';

    // ============================================================================
    // SESSION-CONSISTENT FINGERPRINT SPOOFING
    // ============================================================================

    // 1. Get or Create Fingerprint Identity
    let identity = null;

    // Rotation Detection Logic:
    // background.js uses chrome.browsingData.remove() which reliably clears localStorage.
    // However, sessionStorage often persists across reloads/navigations.
    // If we see an existing sessionStorage identity BUT localStorage marker is missing,
    // it means a rotation occurred (marker cleared) but session leaked.
    // We must FORCE REGENERATE in this case.

    let marker = null;
    try { marker = localStorage.getItem('ag_marker'); } catch (e) { }

    try {
        const stored = sessionStorage.getItem('ag_identity');
        if (stored) {
            identity = JSON.parse(stored);
        }
    } catch (e) { }

    // Check for stale session leak
    if (identity && !marker) {
        console.log('[Antigravity] ♻️ Rotation detected (Marker missing). Forcing new fingerprint.');
        identity = null; // Force regeneration
        try { sessionStorage.removeItem('ag_identity'); } catch (e) { }
    }

    // Set marker for this valid session
    try { localStorage.setItem('ag_marker', 'valid'); } catch (e) { }

    if (!identity) {
        // Generate NEW identity
        const screenWidths = [1920, 1680, 1440, 1366, 1536, 2560];
        const screenHeights = [1080, 1050, 900, 768, 864, 1440];
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
            deviceMemory: [4, 8, 16, 32][Math.floor(Math.random() * 4)],
            canvasNoise: Math.random() * 0.05 + 0.95 // 0.95 to 1.0 noise factor
        };

        try {
            sessionStorage.setItem('ag_identity', JSON.stringify(identity));
        } catch (e) { }

        console.log('[Antigravity] 🎭 Generated NEW session fingerprint:', identity.width + 'x' + identity.height);
    } else {
        console.log('[Antigravity] 🎭 Reusing session fingerprint:', identity.width + 'x' + identity.height);
    }

    // 2. Apply Spoofing

    // 2. Apply Spoofing

    // ========== CANVAS FINGERPRINT (Session Consistent) ==========
    // REMOVED: Canvas pixel noise logic caused mismatch between toDataURL and getImageData.
    // Reverting to REAL canvas fingerprint is safer than a detected spoof.

    // ========== WEBGL FINGERPRINT (Session Consistent) ==========
    const getParameterProxyHandler = {
        apply: function (target, thisArg, args) {
            const param = args[0];
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            if (param === 37446) return identity.renderer;
            return target.apply(thisArg, args);
        }
    };

    try {
        WebGLRenderingContext.prototype.getParameter = new Proxy(
            WebGLRenderingContext.prototype.getParameter, getParameterProxyHandler
        );
        if (typeof WebGL2RenderingContext !== 'undefined') {
            WebGL2RenderingContext.prototype.getParameter = new Proxy(
                WebGL2RenderingContext.prototype.getParameter, getParameterProxyHandler
            );
        }
    } catch (e) { }

    // ========== SCREEN RESOLUTION (Session Consistent) ==========
    try {
        Object.defineProperties(screen, {
            'width': { get: () => identity.width, configurable: true },
            'height': { get: () => identity.height, configurable: true },
            'availWidth': { get: () => identity.width, configurable: true },
            'availHeight': { get: () => identity.height - 40, configurable: true },
            'orientation': { get: () => ({ type: 'landscape-primary', angle: 0 }), configurable: true }
        });

        Object.defineProperties(window, {
            'innerWidth': { get: () => identity.width, configurable: true },
            'innerHeight': { get: () => identity.height - 80, configurable: true },
            'outerWidth': { get: () => identity.width, configurable: true },
            'outerHeight': { get: () => identity.height, configurable: true },
        });
    } catch (e) { }

    // ========== HARDWARE (Session Consistent) ==========
    try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => identity.hardwareConcurrency, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => identity.deviceMemory, configurable: true });
    } catch (e) { }

    // ========== WEBDRIVER BYPASS (Critical) ==========
    try {
        delete navigator.webdriver;
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    } catch (e) { }

})();
