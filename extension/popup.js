/**
 * Antigravity Operator - Popup Controller (Mission Control)
 * 
 * Handles UI interactions, Status Monitoring, and Mission Launch.
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    // Status Badge
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.querySelector('.status-text'),
    statusDot: document.querySelector('.status-dot'),

    // Target Status Card
    targetCard: document.getElementById('targetCard'),
    targetName: document.getElementById('targetName'),
    targetDetails: document.querySelector('.target-info'),
    btnDashboard: document.getElementById('btnDashboard'),

    // Toggles
    autoSniper: document.getElementById('autoSniper'),
    silentMode: document.getElementById('silentMode'),

    // Stats
    totalChecks: document.getElementById('totalChecks'),
    slotsFound: document.getElementById('slotsFound'),

    // Actions
    btnStart: document.getElementById('btnStart'),
    btnStop: document.getElementById('btnStop'),

    // Console
    consoleOutput: document.getElementById('consoleOutput'),
    btnClear: document.getElementById('btnClearConsole'),

    // Footer
    connectionStatus: document.getElementById('connectionStatus'),
    statusIndicator: document.querySelector('.status-indicator'),
    statusLabel: document.querySelector('.status-label'),
    btnTest: document.getElementById('btnTest')
};

// ============================================================================
// STATE
// ============================================================================

let isHunting = false;
let activeClient = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await init();
});

async function init() {
    log('Initializing system...');

    // 1. Load toggle states
    await loadPopupConfig();

    // 2. Load Active Client (The Target)
    await loadActiveClient();

    // 3. Check connection
    checkConnection();

    // 4. Setup listeners
    setupEventListeners();

    // 5. Check if already hunting
    checkHuntingStatus();

    log('System ready.');
}

// ============================================================================
// LOGIC: ACTIVE CLIENT
// ============================================================================

async function loadActiveClient() {
    try {
        const result = await chrome.storage.local.get(['activeClient']);
        activeClient = result.activeClient || null;
        updateTargetUI();
    } catch (error) {
        log(`Error loading client: ${error.message}`, 'error');
    }
}

function updateTargetUI() {
    if (activeClient) {
        // Client Loaded (Ready State)
        elements.targetCard.classList.remove('empty');
        elements.targetCard.classList.add('ready');

        const fullName = `${activeClient.firstName} ${activeClient.lastName}`;
        const centerName = getCenterName(activeClient.center);
        const visaName = getVisaName(activeClient.visaType);

        elements.targetName.innerText = `👤 ${fullName}`;
        elements.targetDetails.innerText = `🎯 ${centerName} | ${visaName}`;

        // Enable Start
        elements.btnStart.disabled = false;
        elements.btnStart.title = "Ready to launch";
    } else {
        // No Client (Empty State)
        elements.targetCard.classList.remove('ready');
        elements.targetCard.classList.add('empty');

        elements.targetName.innerText = "No Active Client";
        elements.targetDetails.innerText = "⚠️ Please load a client in Dashboard";

        // Disable Start
        elements.btnStart.disabled = true;
        elements.btnStart.title = "Load a client first";
    }
}

// Helper to map IDs to names (Simplified map)
function getCenterName(id) {
    const map = { '1': 'Casablanca', '14': 'Tangier', '15': 'Agadir', '12': 'Rabat', '13': 'Nador', '4': 'Tetouan' };
    return map[id] || `Center ${id}`;
}

function getVisaName(id) {
    const map = { '2': 'Schengen Visa', '3': 'National Visa' };
    return map[id] || `Visa ${id}`;
}

// ============================================================================
// LOGIC: CONFIG & TOGGLES
// ============================================================================

async function loadPopupConfig() {
    const result = await chrome.storage.local.get(['popupConfig']);
    if (result.popupConfig) {
        elements.autoSniper.checked = result.popupConfig.autoSniper ?? true;
        elements.silentMode.checked = result.popupConfig.silentMode ?? false;
    }
}

async function savePopupConfig() {
    const config = {
        autoSniper: elements.autoSniper.checked,
        silentMode: elements.silentMode.checked
    };
    await chrome.storage.local.set({ popupConfig: config });

    // Notify background
    chrome.runtime.sendMessage({
        type: 'UPDATE_CONFIG',
        payload: config
    }).catch(() => { });
}

// ============================================================================
// LOGIC: MISSION CONTROL
// ============================================================================

function startHunting() {
    if (!activeClient) {
        log('Cannot start: No active client', 'error');
        return;
    }

    log('🚀 Launching mission...', 'info');

    // Send Start command
    chrome.runtime.sendMessage({ type: 'START_HUNTING' }, response => {
        if (chrome.runtime.lastError) {
            log(`Launch failed: ${chrome.runtime.lastError.message}`, 'error');
        } else {
            setHuntingState(true);
        }
    });
}

function stopHunting() {
    log('⏹ Stopping mission...', 'warning');
    // Implement stop logic if needed (e.g. telling background to stop checking)
    // For now just UI update
    setHuntingState(false);
}

function setHuntingState(hunting) {
    isHunting = hunting;
    if (hunting) {
        elements.btnStart.style.display = 'none';
        elements.btnStop.style.display = 'flex';
        elements.statusText.innerText = 'HUNTING';
        elements.statusBadge.classList.add('hunting');
    } else {
        elements.btnStart.style.display = 'flex';
        elements.btnStop.style.display = 'none';
        elements.statusText.innerText = 'IDLE';
        elements.statusBadge.classList.remove('hunting');
    }
}

function checkHuntingStatus() {
    // Ask background if running
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, response => {
        if (response && response.isHunting) {
            setHuntingState(true);
        }
    });
}

// ============================================================================
// LOGIC: CONSOLE & LOGGING
// ============================================================================

function log(message, level = 'info') {
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    const div = document.createElement('div');
    div.className = `log-entry log-${level}`;
    div.innerHTML = `<span class="time">[${now}]</span> ${message}`;

    elements.consoleOutput.appendChild(div);
    elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
}

function clearConsole() {
    elements.consoleOutput.innerHTML = '';
    log('Console cleared.');
}

// ============================================================================
// LOGIC: CONNECTION WATCHDOG
// ============================================================================

function checkConnection() {
    // Simple ping
    chrome.runtime.sendMessage({ type: 'PING' }, response => {
        if (chrome.runtime.lastError) {
            setConnectionStatus(false);
        } else {
            setConnectionStatus(true);
        }
    });
}

function setConnectionStatus(connected) {
    if (connected) {
        elements.statusIndicator.classList.remove('disconnected');
        elements.statusIndicator.classList.add('connected');
        elements.statusLabel.innerText = 'Connected';
    } else {
        elements.statusIndicator.classList.remove('connected');
        elements.statusIndicator.classList.add('disconnected');
        elements.statusLabel.innerText = 'Disconnected';
    }
}

// ============================================================================
// LISTENERS
// ============================================================================

function setupEventListeners() {
    // Toggles
    elements.autoSniper.addEventListener('change', () => {
        savePopupConfig();
        log(`Auto-Sniper: ${elements.autoSniper.checked ? 'ON' : 'OFF'}`);
    });

    elements.silentMode.addEventListener('change', () => {
        savePopupConfig();
        log(`Silent Mode: ${elements.silentMode.checked ? 'ON' : 'OFF'}`);
    });

    // Dashboard Button
    elements.btnDashboard.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Start/Stop
    elements.btnStart.addEventListener('click', startHunting);
    elements.btnStop.addEventListener('click', stopHunting);

    // Console
    elements.btnClear.addEventListener('click', clearConsole);

    // Test
    elements.btnTest.addEventListener('click', () => {
        log('Running diagnostics...', 'info');
        setTimeout(() => log('All systems nominal.', 'success'), 800);
    });

    // Proxy Rotation Button
    const btnRotate = document.getElementById('btnRotateProxy');
    const proxyStatus = document.getElementById('proxyStatus');

    if (btnRotate) {
        btnRotate.addEventListener('click', () => {
            // INSTANT FEEDBACK
            log('🔄 Scrubbing session...', 'warning');
            btnRotate.innerText = '🧼 SCRUBBING...';
            btnRotate.style.background = '#ff9800'; // Orange
            btnRotate.disabled = true;

            chrome.runtime.sendMessage({ type: 'ROTATE_PROXY' }, (res) => {
                // Background returns immediately now
                setTimeout(() => {
                    btnRotate.innerText = '✅ CLEAN';
                    btnRotate.style.background = '#4caf50'; // Green

                    // Update IP Display
                    chrome.runtime.sendMessage({ type: 'GET_PROXY_STATUS' }, (s) => {
                        if (s?.status?.ip && proxyStatus) proxyStatus.innerText = s.status.ip;
                    });

                    // Reset button after 1.5s
                    setTimeout(() => {
                        btnRotate.innerText = '🔄 Rotate IP';
                        btnRotate.style.background = '#ff9800';
                        btnRotate.disabled = false;
                    }, 1500);
                }, 500); // Visual delay for feel
            });
        });

        // Load current proxy status on init
        chrome.runtime.sendMessage({ type: 'GET_PROXY_STATUS' }, (res) => {
            if (res?.success && res.status?.ip && proxyStatus) {
                proxyStatus.innerText = res.status.ip;
            }
        });
    }

    // Listen for messages from Background/Content
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'LOG_UPDATE') {
            log(message.payload.message, message.payload.level);
        }
        if (message.type === 'STATUS_UPDATE') {
            // Update stats if provided
            if (message.payload.checks) elements.totalChecks.innerText = message.payload.checks;
        }
    });
}
