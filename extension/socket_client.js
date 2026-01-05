/**
 * Antigravity Operator - Socket Client (Hive Connector)
 * 
 * Connects the Chrome Extension to the Antigravity Orchestrator server.
 * Enables remote command execution and real-time coordination.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOCKET_CONFIG = {
    // Server endpoint
    serverUrl: 'ws://localhost:3000',

    // Reconnection settings
    reconnect: {
        enabled: true,
        interval: 5000,      // 5 seconds
        maxAttempts: 0       // 0 = infinite
    },

    // Heartbeat settings
    heartbeat: {
        interval: 30000,     // 30 seconds
        enabled: true
    },

    // Client identification
    clientName: 'Antigravity-Extension'
};

// ============================================================================
// STATE
// ============================================================================

const socketState = {
    socket: null,
    clientId: null,
    connected: false,
    reconnecting: false,
    reconnectAttempts: 0,
    heartbeatTimer: null,
    reconnectTimer: null,
    serverTimeOffset: 0,
    lastHeartbeat: null
};

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

/**
 * Initializes the WebSocket connection to the server.
 * 
 * @returns {Promise<boolean>} Connection success status
 */
async function connectToServer() {
    if (socketState.connected || socketState.reconnecting) {
        console.log('[Socket] Already connected or reconnecting');
        return false;
    }

    console.log(`[Socket] 🔌 Connecting to ${SOCKET_CONFIG.serverUrl}...`);

    return new Promise((resolve) => {
        try {
            socketState.socket = new WebSocket(SOCKET_CONFIG.serverUrl);

            socketState.socket.onopen = () => {
                console.log('[Socket] ✅ Connected to Orchestrator');
                socketState.connected = true;
                socketState.reconnecting = false;
                socketState.reconnectAttempts = 0;

                // Start heartbeat
                if (SOCKET_CONFIG.heartbeat.enabled) {
                    startHeartbeat();
                }

                // Broadcast connection status
                broadcastConnectionStatus(true);

                resolve(true);
            };

            socketState.socket.onmessage = (event) => {
                handleServerMessage(event.data);
            };

            socketState.socket.onclose = (event) => {
                console.log(`[Socket] 🔌 Disconnected (code: ${event.code})`);
                handleDisconnection();
                resolve(false);
            };

            socketState.socket.onerror = (error) => {
                console.error('[Socket] ❌ Connection error:', error);
                resolve(false);
            };

        } catch (error) {
            console.error('[Socket] Failed to create WebSocket:', error);
            scheduleReconnect();
            resolve(false);
        }
    });
}

/**
 * Handles disconnection and triggers reconnection if enabled.
 */
function handleDisconnection() {
    socketState.connected = false;
    socketState.socket = null;

    // Stop heartbeat
    stopHeartbeat();

    // Broadcast disconnection
    broadcastConnectionStatus(false);

    // Schedule reconnection
    if (SOCKET_CONFIG.reconnect.enabled) {
        scheduleReconnect();
    }
}

/**
 * Schedules a reconnection attempt.
 */
function scheduleReconnect() {
    if (socketState.reconnectTimer) {
        return; // Already scheduled
    }

    const { maxAttempts, interval } = SOCKET_CONFIG.reconnect;

    if (maxAttempts > 0 && socketState.reconnectAttempts >= maxAttempts) {
        console.log('[Socket] Max reconnection attempts reached');
        return;
    }

    socketState.reconnecting = true;
    socketState.reconnectAttempts++;

    console.log(`[Socket] 🔄 Reconnecting in ${interval / 1000}s (attempt ${socketState.reconnectAttempts})`);

    socketState.reconnectTimer = setTimeout(() => {
        socketState.reconnectTimer = null;
        connectToServer();
    }, interval);
}

/**
 * Disconnects from the server.
 */
function disconnectFromServer() {
    console.log('[Socket] Disconnecting...');

    stopHeartbeat();

    if (socketState.reconnectTimer) {
        clearTimeout(socketState.reconnectTimer);
        socketState.reconnectTimer = null;
    }

    socketState.reconnecting = false;

    if (socketState.socket) {
        socketState.socket.close();
        socketState.socket = null;
    }

    socketState.connected = false;
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handles incoming messages from the server.
 * 
 * @param {string} data - Raw message data
 */
function handleServerMessage(data) {
    try {
        const message = JSON.parse(data);
        const { type, payload } = message;

        console.log(`[Socket] 📨 Received: ${type}`);

        switch (type) {
            case 'WELCOME':
                handleWelcome(payload);
                break;

            case 'HEARTBEAT_ACK':
                socketState.lastHeartbeat = Date.now();
                break;

            case 'SNIPER_TRIGGER':
                handleSniperTrigger(payload);
                break;

            case 'START_SCOUT':
                handleStartScout(payload);
                break;

            case 'STOP_SCOUT':
                handleStopScout();
                break;

            case 'CHANGE_PROXY':
            case 'ROTATE_PROXY':
                handleRotateProxy();
                break;

            case 'EXECUTE_COMMAND':
                handleExecuteCommand(payload);
                break;

            case 'CLIENT_COUNT':
                console.log(`[Socket] 👥 Connected clients: ${payload?.count}`);
                break;

            case 'BOOKING_COMPLETE':
                handleBookingComplete(payload);
                break;

            case 'SERVER_SHUTDOWN':
                console.log('[Socket] ⚠️ Server is shutting down');
                disconnectFromServer();
                break;

            default:
                console.log(`[Socket] Unknown message type: ${type}`, payload);
        }

    } catch (error) {
        console.error('[Socket] Failed to parse message:', error);
    }
}

/**
 * Handles the welcome message from server.
 * 
 * @param {Object} payload - Welcome payload with clientId
 */
function handleWelcome(payload) {
    socketState.clientId = payload.clientId;
    socketState.serverTimeOffset = Date.now() - payload.serverTime;

    console.log(`[Socket] 🆔 Assigned ID: ${socketState.clientId}`);
    console.log(`[Socket] ⏰ Server time offset: ${socketState.serverTimeOffset}ms`);

    // Register with our name
    sendToServer({
        type: 'REGISTER',
        payload: {
            name: SOCKET_CONFIG.clientName,
            version: chrome.runtime.getManifest().version
        }
    });
}

/**
 * Handles SNIPER_TRIGGER command from server.
 * 
 * @param {Object} payload - Slot data
 */
async function handleSniperTrigger(payload) {
    console.log('[Socket] 🎯 SNIPER TRIGGER received!');

    if (!globalThis.AntigravitySniper) {
        console.error('[Socket] Sniper module not available');
        return;
    }

    try {
        // Get active session
        const session = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (response) => {
                resolve(response?.session);
            });
        });

        if (payload?.slots?.length > 0) {
            const slot = payload.slots[0];
            const result = await globalThis.AntigravitySniper.executeSniper(slot, session);

            // Report result to server
            sendToServer({
                type: result.status === 'BOOKED' ? 'BOOKING_SUCCESS' : 'BOOKING_FAILED',
                payload: { result, slotData: slot }
            });
        }
    } catch (error) {
        console.error('[Socket] Sniper execution failed:', error);
        sendToServer({
            type: 'ERROR',
            payload: { error: error.message }
        });
    }
}

/**
 * Handles START_SCOUT command from server.
 * 
 * @param {Object} payload - Scout configuration
 */
async function handleStartScout(payload) {
    console.log('[Socket] 🔍 START SCOUT command received');

    if (!globalThis.AntigravityScout) {
        console.error('[Socket] Scout module not available');
        return;
    }

    try {
        const result = await globalThis.AntigravityScout.startScout(
            payload?.dataParam,
            payload?.options
        );

        sendToServer({
            type: 'STATUS_UPDATE',
            payload: { status: 'hunting', result }
        });
    } catch (error) {
        console.error('[Socket] Scout start failed:', error);
        sendToServer({
            type: 'ERROR',
            payload: { error: error.message }
        });
    }
}

/**
 * Handles STOP_SCOUT command from server.
 */
function handleStopScout() {
    console.log('[Socket] 🛑 STOP SCOUT command received');

    if (!globalThis.AntigravityScout) {
        console.error('[Socket] Scout module not available');
        return;
    }

    const result = globalThis.AntigravityScout.stopScout();

    sendToServer({
        type: 'STATUS_UPDATE',
        payload: { status: 'idle', result }
    });
}

/**
 * Handles CHANGE_PROXY/ROTATE_PROXY command from server.
 */
async function handleRotateProxy() {
    console.log('[Socket] 🔄 ROTATE PROXY command received');

    if (!globalThis.AntigravityProxyManager) {
        console.error('[Socket] ProxyManager module not available');
        return;
    }

    try {
        const result = await globalThis.AntigravityProxyManager.rotateProxy();

        sendToServer({
            type: 'STATUS_UPDATE',
            payload: { status: 'proxy_rotated', result }
        });
    } catch (error) {
        console.error('[Socket] Proxy rotation failed:', error);
    }
}

/**
 * Handles generic command execution.
 * 
 * @param {Object} payload - Command details
 */
function handleExecuteCommand(payload) {
    const { command, args } = payload;

    console.log(`[Socket] 🔧 Executing command: ${command}`);

    // Route command through background message system
    chrome.runtime.sendMessage({
        type: command,
        payload: args
    }, (response) => {
        sendToServer({
            type: 'COMMAND_RESULT',
            payload: { command, response }
        });
    });
}

/**
 * Handles notification that another client completed a booking.
 * 
 * @param {Object} payload - Booking details
 */
function handleBookingComplete(payload) {
    console.log(`[Socket] 🎉 Booking completed by: ${payload?.bookedBy}`);

    // Optionally stop our own hunting
    if (globalThis.AntigravityScout?.getScoutStatus?.()?.isPolling) {
        console.log('[Socket] Stopping hunt - booking already made');
        globalThis.AntigravityScout.stopScout();
    }
}

// ============================================================================
// HEARTBEAT
// ============================================================================

/**
 * Starts the heartbeat interval.
 */
function startHeartbeat() {
    stopHeartbeat();

    socketState.heartbeatTimer = setInterval(() => {
        sendHeartbeat();
    }, SOCKET_CONFIG.heartbeat.interval);

    // Send initial heartbeat
    sendHeartbeat();
}

/**
 * Stops the heartbeat interval.
 */
function stopHeartbeat() {
    if (socketState.heartbeatTimer) {
        clearInterval(socketState.heartbeatTimer);
        socketState.heartbeatTimer = null;
    }
}

/**
 * Sends a heartbeat message to the server.
 */
function sendHeartbeat() {
    if (!socketState.connected) return;

    // Get current stats
    const scoutStatus = globalThis.AntigravityScout?.getScoutStatus?.() || {};
    const sniperStatus = globalThis.AntigravitySniper?.getSniperStatus?.() || {};

    sendToServer({
        type: 'HEARTBEAT',
        payload: {
            clientId: socketState.clientId,
            timestamp: Date.now(),
            status: scoutStatus.isPolling ? 'hunting' : 'idle',
            stats: {
                checks: scoutStatus.totalChecks || 0,
                slotsFound: scoutStatus.slotsFound || 0,
                bookings: sniperStatus.successfulShots || 0
            }
        }
    });
}

// ============================================================================
// SENDING MESSAGES
// ============================================================================

/**
 * Sends a message to the server.
 * 
 * @param {Object} message - Message to send
 * @returns {boolean} Success status
 */
function sendToServer(message) {
    if (!socketState.socket || socketState.socket.readyState !== WebSocket.OPEN) {
        console.warn('[Socket] Cannot send - not connected');
        return false;
    }

    try {
        socketState.socket.send(JSON.stringify(message));
        return true;
    } catch (error) {
        console.error('[Socket] Send failed:', error);
        return false;
    }
}

/**
 * Reports a slot found event to the server.
 * 
 * @param {Object} slotData - Slot details
 */
function reportSlotFound(slotData) {
    sendToServer({
        type: 'SLOT_FOUND',
        payload: slotData
    });
}

/**
 * Reports a booking success to the server.
 * 
 * @param {Object} bookingData - Booking details
 */
function reportBookingSuccess(bookingData) {
    sendToServer({
        type: 'BOOKING_SUCCESS',
        payload: bookingData
    });
}

// ============================================================================
// STATUS & UTILITIES
// ============================================================================

/**
 * Gets the current socket connection status.
 * 
 * @returns {Object} Connection status
 */
function getSocketStatus() {
    return {
        connected: socketState.connected,
        clientId: socketState.clientId,
        reconnecting: socketState.reconnecting,
        reconnectAttempts: socketState.reconnectAttempts,
        serverTimeOffset: socketState.serverTimeOffset,
        lastHeartbeat: socketState.lastHeartbeat
    };
}

/**
 * Broadcasts connection status to extension components.
 * 
 * @param {boolean} connected - Connection status
 */
function broadcastConnectionStatus(connected) {
    chrome.runtime.sendMessage({
        type: 'SOCKET_STATUS',
        payload: { connected, clientId: socketState.clientId }
    }).catch(() => { });

    chrome.runtime.sendMessage({
        type: 'LOG_UPDATE',
        payload: {
            message: connected ? '🔌 Connected to Orchestrator' : '🔌 Disconnected from server',
            level: connected ? 'success' : 'warning'
        }
    }).catch(() => { });
}

// ============================================================================
// MESSAGE HANDLER (Listen for extension events to forward)
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;

    switch (type) {
        case 'CONNECT_TO_SERVER':
            connectToServer()
                .then(result => sendResponse({ success: result }))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'DISCONNECT_FROM_SERVER':
            disconnectFromServer();
            sendResponse({ success: true });
            break;

        case 'GET_SOCKET_STATUS':
            sendResponse(getSocketStatus());
            break;

        case 'SEND_TO_SERVER':
            const sent = sendToServer(payload);
            sendResponse({ success: sent });
            break;

        // Forward important events to server
        case 'SLOTS_FOUND':
        case 'SCOUT_RESULT':
            if (payload?.status === 'FOUND' && socketState.connected) {
                reportSlotFound(payload);
            }
            break;

        case 'BOOKING_SUCCESS':
            if (socketState.connected) {
                reportBookingSuccess(payload);
            }
            break;
    }

    return false;
});

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof globalThis !== 'undefined') {
    globalThis.AntigravitySocket = {
        connectToServer,
        disconnectFromServer,
        sendToServer,
        getSocketStatus,
        reportSlotFound,
        reportBookingSuccess,
        SOCKET_CONFIG
    };
}

// ============================================================================
// AUTO-CONNECT ON LOAD
// ============================================================================

// Attempt connection after a short delay to ensure other modules are loaded
setTimeout(() => {
    console.log('[Socket] 🚀 Initializing Hive Connector...');
    connectToServer();
}, 2000);

console.log('[Socket] Hive Connector module loaded');
