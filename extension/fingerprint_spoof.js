/**
 * Antigravity - Passive Fingerprint Spoofing
 * 
 * CRITICAL: This script runs in MAIN world at document_start.
 * Only spoof Navigator properties - DO NOT touch DOM prototypes.
 * This prevents the 'reading id' error in site scripts.
 */

try {
    // Only spoof Navigator properties (User Agent, etc.)
    // DO NOT touch DOM prototypes like HTMLCanvasElement or WebGL
    // This prevents the 'reading id' error in site scripts.

    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });

    console.log("[Antigravity] 🎭 Passive Stealth Active");
} catch (e) {
    console.warn("Stealth error:", e);
}
