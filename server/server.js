/**
 * Antigravity Orchestrator - The Brain
 * 
 * Central command server for the Hive automation system.
 * Manages connected extensions, coordinates slot hunting, and sends notifications.
 */

require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    port: process.env.PORT || 3000,
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN',
        chatId: process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID',
        enabled: process.env.TELEGRAM_ENABLED === 'true'
    },
    heartbeat: {
        interval: 30000,       // 30 seconds
        timeout: 60000         // 60 seconds - disconnect if no heartbeat
    }
};

// ============================================================================
// EXPRESS SERVER SETUP
// ============================================================================

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// REST API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        connectedClients: clients.size,
        timestamp: Date.now()
    });
});

/**
 * Time sync endpoint - Extensions use this to calculate server offset
 */
app.get('/timestamp', (req, res) => {
    res.json({
        time: Date.now(),
        iso: new Date().toISOString()
    });
});

/**
 * Get all connected clients
 */
app.get('/clients', (req, res) => {
    const clientList = [];
    clients.forEach((client, id) => {
        clientList.push({
            id,
            name: client.name,
            connectedAt: client.connectedAt,
            lastHeartbeat: client.lastHeartbeat,
            status: client.status,
            stats: client.stats
        });
    });
    res.json({ clients: clientList, count: clientList.length });
});

/**
 * Send command to specific client
 */
app.post('/command/:clientId', (req, res) => {
    const { clientId } = req.params;
    const command = req.body;

    const client = clients.get(clientId);
    if (!client) {
        return res.status(404).json({ error: 'Client not found' });
    }

    if (client.ws.readyState !== 1) {
        return res.status(503).json({ error: 'Client not connected' });
    }

    client.ws.send(JSON.stringify(command));
    res.json({ success: true, message: `Command sent to ${clientId}` });
});

/**
 * Broadcast command to all clients
 */
app.post('/broadcast', (req, res) => {
    const command = req.body;
    let sentCount = 0;

    clients.forEach((client) => {
        if (client.ws.readyState === 1) {
            client.ws.send(JSON.stringify(command));
            sentCount++;
        }
    });

    res.json({ success: true, sentTo: sentCount });
});

/**
 * Trigger notification manually
 */
app.post('/notify', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }

    try {
        await notifyUser(message);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Solve Grid Captcha via NoCaptchaAI (No Auth Required on Server)
 * Supports passing API Key from client settings.
 */
app.post('/solve-grid-captcha', async (req, res) => {
    try {
        const { images, target, apiKey } = req.body;

        // Use client's key if provided, else falls back to env (optional)
        const keyToUse = apiKey || process.env.NOCAPTCHA_API_KEY;

        if (!keyToUse) {
            return res.status(400).json({ error: 'API Key missing. Please set it in extension settings.' });
        }

        if (!images || !target) {
            return res.status(400).json({ error: 'Missing images or target instruction.' });
        }

        console.log(`[Captcha] 🧩 Solving Grid Captcha (${images.length} images) for target: "${target}"`);

        // Improved payload with clearer question format
        const payload = {
            clientKey: keyToUse,
            task: {
                type: "ImageToTextTask",
                images: images,
                module: "grid3x3",  // Changed from "morocco" to grid-specific
                question: `Read the 3-digit number in each image. Return "yes" if the number is "${target}", otherwise return "no".`,
                numeric: true,
                minLength: 3,
                maxLength: 3,
                target: target  // Explicitly pass target
            }
        };

        // Log payload summary
        const logPayload = { ...payload, task: { ...payload.task, images: [`[${images.length} Base64 Strings]`] } };
        console.log('Sending Payload:', JSON.stringify(logPayload, null, 2));

        const response = await fetch('https://api.nocaptchaai.com/createTask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': keyToUse
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        console.log('NoCaptcha Status:', response.status);
        console.log('NoCaptcha Body:', JSON.stringify(result, null, 2));

        // Validation Logic:
        // 1. Check for explicit error (errorId != 0 and error description exists)
        // 2. Check for successful status ('solved' or 'ready')
        // CRITICAL FIX: Treat errorId === 0 as valid success
        const hasError = (result.errorId && result.errorId !== 0) || (result.status !== 'solved' && result.status !== 'ready');

        if (!hasError) {
            let matches = [];

            // Handle multiple Solution Formats from NoCaptcha API
            const solutions = Array.isArray(result.solution) ? result.solution :
                (result.solution?.text ? (Array.isArray(result.solution.text) ? result.solution.text : [result.solution.text]) : []);

            console.log(`[Captcha] 🔍 Raw solutions: ${JSON.stringify(solutions)}`);
            console.log(`[Captcha] 🎯 Looking for target: "${target}"`);

            solutions.forEach((val, index) => {
                const valStr = String(val).trim().toLowerCase();
                const targetStr = String(target).trim();

                // Match if:
                // 1. Value equals target exactly
                // 2. Value is "yes" (for yes/no format questions)
                // 3. Value is "true" 
                // 4. Value contains the target number
                if (valStr === targetStr ||
                    valStr === 'yes' ||
                    valStr === 'true' ||
                    valStr.includes(targetStr)) {
                    matches.push(index);
                    console.log(`[Captcha] ✓ Match at index ${index}: "${val}"`);
                }
            });

            // Also check if result has explicit indices format
            if (result.solution && Array.isArray(result.solution.indices)) {
                matches = result.solution.indices;
                console.log(`[Captcha] Using explicit indices: ${JSON.stringify(matches)}`);
            }

            if (matches.length > 0) {
                console.log(`[Captcha] ✅ SUCCESS! Matches: ${JSON.stringify(matches)}`);
            } else if (solutions.length > 0) {
                console.warn(`[Captcha] ⚠️ No matches found! Solutions were: ${JSON.stringify(solutions)}`);
            }

            res.json({ success: true, matches, solutions });

        } else {
            console.error('[Captcha] ❌ Failed:', result);
            res.status(500).json({
                success: false,
                error: result.error || result.description || 'Unknown NoCaptcha Error',
                details: result
            });
        }

    } catch (error) {
        console.error('[Captcha] Server Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// WEBSOCKET SERVER (THE HIVE)
// ============================================================================

const wss = new WebSocketServer({ server });
const clients = new Map();

wss.on('connection', (ws, req) => {
    const clientId = uuidv4();
    const clientIp = req.socket.remoteAddress;

    console.log(`\n🔗 [CONNECT] New client: ${clientId} from ${clientIp}`);

    // Initialize client state
    const clientState = {
        id: clientId,
        ws,
        name: `Client-${clientId.slice(0, 8)}`,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        status: 'idle',
        stats: {
            checks: 0,
            slotsFound: 0,
            bookings: 0
        }
    };

    clients.set(clientId, clientState);

    // Send welcome message with client ID
    ws.send(JSON.stringify({
        type: 'WELCOME',
        payload: {
            clientId,
            serverTime: Date.now(),
            message: 'Connected to Antigravity Orchestrator'
        }
    }));

    // Broadcast client count update
    broadcastClientCount();

    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleClientMessage(clientId, message);
        } catch (error) {
            console.error(`[ERROR] Failed to parse message from ${clientId}:`, error);
        }
    });

    // Handle disconnection
    ws.on('close', () => {
        console.log(`\n🔌 [DISCONNECT] Client: ${clientId}`);
        clients.delete(clientId);
        broadcastClientCount();
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`[ERROR] WebSocket error for ${clientId}:`, error);
        clients.delete(clientId);
    });
});

/**
 * Handles incoming messages from connected clients.
 * 
 * @param {string} clientId - The client identifier
 * @param {Object} message - The parsed message object
 */
function handleClientMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    const { type, payload } = message;

    switch (type) {
        case 'HEARTBEAT':
            client.lastHeartbeat = Date.now();
            client.status = payload?.status || 'active';
            if (payload?.stats) {
                client.stats = { ...client.stats, ...payload.stats };
            }
            // Acknowledge heartbeat
            client.ws.send(JSON.stringify({ type: 'HEARTBEAT_ACK', timestamp: Date.now() }));
            break;

        case 'REGISTER':
            client.name = payload?.name || client.name;
            console.log(`📝 [REGISTER] Client ${clientId} registered as "${client.name}"`);
            break;

        case 'STATUS_UPDATE':
            client.status = payload?.status || client.status;
            console.log(`📊 [STATUS] ${client.name}: ${client.status}`);
            break;

        case 'SLOT_FOUND':
            handleSlotFound(clientId, payload);
            break;

        case 'BOOKING_SUCCESS':
            handleBookingSuccess(clientId, payload);
            break;

        case 'BOOKING_FAILED':
            console.log(`❌ [BOOKING FAILED] ${client.name}:`, payload?.reason);
            break;

        case 'ERROR':
            console.error(`⚠️ [ERROR] ${client.name}:`, payload?.error);
            break;

        case 'LOG':
            console.log(`📝 [${client.name}] ${payload?.message}`);
            break;

        default:
            console.log(`📨 [${client.name}] Unknown message type: ${type}`);
    }
}

/**
 * Handles SLOT_FOUND events - The most critical event!
 * 
 * @param {string} clientId - The client that found the slot
 * @param {Object} payload - Slot details
 */
async function handleSlotFound(clientId, payload) {
    const client = clients.get(clientId);
    const clientName = client?.name || clientId;

    console.log('\n' + '='.repeat(60));
    console.log('🚨🚨🚨 SLOT FOUND 🚨🚨🚨');
    console.log('='.repeat(60));
    console.log(`Found by: ${clientName}`);
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Details:`, JSON.stringify(payload, null, 2));
    console.log('='.repeat(60) + '\n');

    // Update client stats
    if (client) {
        client.stats.slotsFound++;
    }

    // Send Telegram notification IMMEDIATELY
    const telegramMessage = `
🚨 *SLOT FOUND!* 🚨

📍 *Found by:* ${clientName}
⏰ *Time:* ${new Date().toLocaleString()}
📅 *Date:* ${payload?.date || 'N/A'}
🕐 *Slot:* ${payload?.time || 'N/A'}
🆔 *Slot ID:* ${payload?.slotId || 'N/A'}

${payload?.count ? `📊 *Available:* ${payload.count} slot(s)` : ''}

🎯 Attempting auto-booking...
  `.trim();

    await notifyUser(telegramMessage);

    // Broadcast to other clients (optional sniper trigger)
    broadcastToOthers(clientId, {
        type: 'SNIPER_TRIGGER',
        payload: {
            source: clientName,
            slots: payload?.slots,
            timestamp: Date.now()
        }
    });
}

/**
 * Handles successful booking events.
 * 
 * @param {string} clientId - The client that made the booking
 * @param {Object} payload - Booking details
 */
async function handleBookingSuccess(clientId, payload) {
    const client = clients.get(clientId);
    const clientName = client?.name || clientId;

    console.log('\n' + '🎉'.repeat(20));
    console.log('✅ BOOKING SUCCESSFUL! ✅');
    console.log('🎉'.repeat(20));
    console.log(`Booked by: ${clientName}`);
    console.log(`Details:`, JSON.stringify(payload, null, 2));
    console.log('🎉'.repeat(20) + '\n');

    // Update client stats
    if (client) {
        client.stats.bookings++;
    }

    // Send celebratory Telegram notification
    const telegramMessage = `
🎉🎉🎉 *BOOKING CONFIRMED!* 🎉🎉🎉

✅ *Status:* SUCCESS
📍 *Booked by:* ${clientName}
⏰ *Time:* ${new Date().toLocaleString()}
📅 *Appointment Date:* ${payload?.slotData?.date || 'N/A'}
🕐 *Appointment Time:* ${payload?.slotData?.time || 'N/A'}

🎊 Congratulations! Your appointment is secured!
  `.trim();

    await notifyUser(telegramMessage);

    // Optionally stop other clients from hunting
    broadcastToAll({
        type: 'BOOKING_COMPLETE',
        payload: {
            bookedBy: clientName,
            slotData: payload?.slotData
        }
    });
}

// ============================================================================
// TELEGRAM BOT
// ============================================================================

let telegramBot = null;

if (CONFIG.telegram.enabled && CONFIG.telegram.token !== 'YOUR_TELEGRAM_BOT_TOKEN') {
    try {
        telegramBot = new TelegramBot(CONFIG.telegram.token, { polling: false });
        console.log('✅ Telegram bot initialized');
    } catch (error) {
        console.error('❌ Failed to initialize Telegram bot:', error.message);
    }
}

/**
 * Sends a notification to the configured Telegram chat.
 * 
 * @param {string} message - The message to send (supports Markdown)
 */
async function notifyUser(message) {
    console.log(`📱 [TELEGRAM] Sending notification...`);

    if (!telegramBot) {
        console.log('📱 [TELEGRAM] Bot not configured, logging message:');
        console.log(message);
        return;
    }

    try {
        await telegramBot.sendMessage(CONFIG.telegram.chatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
        console.log('📱 [TELEGRAM] ✅ Notification sent!');
    } catch (error) {
        console.error('📱 [TELEGRAM] ❌ Failed to send:', error.message);
    }
}

// ============================================================================
// BROADCAST UTILITIES
// ============================================================================

/**
 * Broadcasts a message to all connected clients.
 * 
 * @param {Object} message - Message to broadcast
 */
function broadcastToAll(message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    clients.forEach((client) => {
        if (client.ws.readyState === 1) {
            client.ws.send(messageStr);
            sentCount++;
        }
    });

    console.log(`📡 [BROADCAST] Sent to ${sentCount} clients`);
}

/**
 * Broadcasts a message to all clients except one.
 * 
 * @param {string} excludeId - Client ID to exclude
 * @param {Object} message - Message to broadcast
 */
function broadcastToOthers(excludeId, message) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;

    clients.forEach((client, id) => {
        if (id !== excludeId && client.ws.readyState === 1) {
            client.ws.send(messageStr);
            sentCount++;
        }
    });

    if (sentCount > 0) {
        console.log(`📡 [BROADCAST] Sent to ${sentCount} other clients`);
    }
}

/**
 * Broadcasts the current client count to all clients.
 */
function broadcastClientCount() {
    broadcastToAll({
        type: 'CLIENT_COUNT',
        payload: { count: clients.size }
    });
}

// ============================================================================
// HEARTBEAT MONITOR
// ============================================================================

/**
 * Monitors client heartbeats and disconnects stale clients.
 */
setInterval(() => {
    const now = Date.now();

    clients.forEach((client, id) => {
        const timeSinceHeartbeat = now - client.lastHeartbeat;

        if (timeSinceHeartbeat > CONFIG.heartbeat.timeout) {
            console.log(`💔 [TIMEOUT] Client ${client.name} - No heartbeat for ${Math.round(timeSinceHeartbeat / 1000)}s`);
            client.ws.terminate();
            clients.delete(id);
        }
    });
}, CONFIG.heartbeat.interval);

// ============================================================================
// SERVER STARTUP
// ============================================================================

server.listen(CONFIG.port, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 ANTIGRAVITY ORCHESTRATOR - THE BRAIN');
    console.log('='.repeat(60));
    console.log(`📡 HTTP Server:    http://localhost:${CONFIG.port}`);
    console.log(`🔌 WebSocket:      ws://localhost:${CONFIG.port}`);
    console.log(`📱 Telegram:       ${CONFIG.telegram.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`⏰ Started:        ${new Date().toISOString()}`);
    console.log('='.repeat(60));
    console.log('\n📍 Endpoints:');
    console.log(`   GET  /health     - Server health check`);
    console.log(`   GET  /timestamp  - Server time (for sync)`);
    console.log(`   GET  /clients    - List connected clients`);
    console.log(`   POST /command/:id - Send command to client`);
    console.log(`   POST /broadcast  - Broadcast to all clients`);
    console.log(`   POST /notify     - Send Telegram notification`);
    console.log('\n🎯 Waiting for connections...\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('\n⚠️ Shutting down gracefully...');

    // Notify all clients
    broadcastToAll({ type: 'SERVER_SHUTDOWN' });

    // Close all connections
    clients.forEach((client) => {
        client.ws.close();
    });

    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});
