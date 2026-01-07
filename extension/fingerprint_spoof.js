/**
 * Fingerprint Spoof - Anti-Detection Module
 * Wrapped in try-catch to prevent crashing the site
 */
try {
    console.log("[Antigravity] 🎭 Stealth Mode: Initializing...");

    // Spoof WebDriver detection
    Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
    });

    // Spoof Chrome detection
    if (!window.chrome) {
        window.chrome = { runtime: {} };
    }

    // Spoof plugins
    Object.defineProperty(navigator, 'plugins', {
        get: () => [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' }
        ],
        configurable: true
    });

    // Spoof languages
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'fr'],
        configurable: true
    });

    // Spoof platform
    Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
        configurable: true
    });

    // Spoof hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
        configurable: true
    });

    // Spoof device memory 
    Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
        configurable: true
    });

    console.log("[Antigravity] 🎭 Stealth Mode: Active");

} catch (e) {
    console.log("[Antigravity] 🎭 Stealth Mode: Skipped (non-critical error)");
}
