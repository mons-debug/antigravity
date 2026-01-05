/**
 * Antigravity Operator - Proxy Manager
 * 
 * Handles proxy rotation with localhost bypass protection.
 * CRITICAL: Always bypasses localhost/127.0.0.1 to keep Hive Server connection alive.
 */

const ProxyManager = {
    /**
     * Rotate to the next proxy in the list.
     * @returns {Promise<{success: boolean, proxy?: string, error?: string}>}
     */
    async rotate() {
        console.log('[ProxyManager] 🔄 Initiating Rotation...');

        const data = await chrome.storage.local.get(['proxies', 'currentProxyIndex']);
        const proxies = data.proxies || [];

        if (!proxies || proxies.length === 0) {
            console.warn('[ProxyManager] ⚠️ No proxies loaded in storage!');
            return { success: false, error: 'NO_PROXIES' };
        }

        let nextIndex = ((data.currentProxyIndex || 0) + 1) % proxies.length;

        const proxyString = proxies[nextIndex];
        const parts = proxyString.split(':'); // ip:port or ip:port:user:pass

        if (parts.length < 2) {
            console.error('[ProxyManager] Invalid proxy format:', proxyString);
            return { success: false, error: 'INVALID_FORMAT' };
        }

        // CRITICAL: Bypass localhost to keep Hive Server working!
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: parts[0],
                    port: parseInt(parts[1], 10)
                },
                bypassList: ["localhost", "127.0.0.1", "::1", "<local>"]
            }
        };

        return new Promise((resolve) => {
            chrome.proxy.settings.set({ value: config, scope: 'regular' }, async () => {
                console.log(`[ProxyManager] ✅ Rotated to Proxy #${nextIndex + 1}: ${parts[0]}`);
                await chrome.storage.local.set({ currentProxyIndex: nextIndex });

                // Handle Authentication (if user:pass provided)
                if (parts.length >= 4) {
                    await chrome.storage.session.set({
                        proxyAuth: { username: parts[2], password: parts[3] }
                    });
                } else {
                    await chrome.storage.session.remove('proxyAuth');
                }
                resolve({ success: true, proxy: proxyString });
            });
        });
    },

    /**
     * Clear proxy settings (direct connection).
     */
    async clear() {
        console.log('[ProxyManager] 🚫 Clearing proxy settings...');
        return new Promise((resolve) => {
            chrome.proxy.settings.clear({ scope: 'regular' }, () => {
                console.log('[ProxyManager] ✅ Proxy cleared. Direct connection.');
                resolve({ success: true });
            });
        });
    },

    /**
     * Get current proxy status.
     */
    async getStatus() {
        const data = await chrome.storage.local.get(['proxies', 'currentProxyIndex']);
        const proxies = data.proxies || [];
        const index = data.currentProxyIndex || 0;

        if (proxies.length === 0) {
            return { active: false, message: 'No proxies configured' };
        }

        const current = proxies[index] || proxies[0];
        const ip = current.split(':')[0];

        return {
            active: true,
            index: index + 1,
            total: proxies.length,
            ip: ip,
            message: `Proxy ${index + 1}/${proxies.length}: ${ip}`
        };
    }
};

// ES6 Export for Background Script module
export { ProxyManager };

// Also export for service worker global if needed
if (typeof self !== 'undefined') {
    self.ProxyManager = ProxyManager;
}

console.log('[ProxyManager] Loaded (ES6 Module)');
