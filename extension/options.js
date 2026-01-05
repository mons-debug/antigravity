/**
 * The Barracks - Client Management Dashboard
 * 
 * Manages client profiles for the Antigravity Extension.
 * Stores data in chrome.storage.local under 'clientDatabase'.
 */

// ============================================================================
// CONFIGURATION MAP
// ============================================================================

const CONFIG_MAP = {
    centers: [
        { id: '1', name: 'Casablanca' },
        { id: '14', name: 'Tangier' },
        { id: '15', name: 'Agadir' },
        { id: '12', name: 'Rabat' },
        { id: '13', name: 'Nador' },
        { id: '4', name: 'Tetouan' }
    ],
    visaTypes: [
        { id: '2', name: 'Schengen Visa' },
        { id: '3', name: 'National Visa' }
    ],
    categories: [
        { id: 'Normal', name: 'Normal' },
        { id: 'Premium', name: 'Premium' }
    ]
};

// ============================================================================
// STATE
// ============================================================================

let clients = [];
let activeClientId = null;
let editingClientId = null;
let currentPhotoData = null; // Base64 photo data for current form

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    clientCount: document.getElementById('clientCount'),
    activeIndicator: document.getElementById('activeIndicator'),
    activeClientName: document.getElementById('activeClientName'),
    clientTableBody: document.getElementById('clientTableBody'),
    emptyState: document.getElementById('emptyState'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalTitle: document.getElementById('modalTitle'),
    clientForm: document.getElementById('clientForm'),
    btnAddClient: document.getElementById('btnAddClient'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCancel: document.getElementById('btnCancel'),
    btnImport: document.getElementById('btnImport'),
    btnExport: document.getElementById('btnExport'),
    importFile: document.getElementById('importFile')
};

// Form fields
const formFields = [
    'clientId', 'email', 'password', 'otpSecret',
    'center', 'visaType', 'visaSubType', 'category',
    'firstName', 'lastName', 'dateOfBirth', 'nationality',
    'passportNumber', 'passportExpiry', 'issuePlace', 'phone'
];

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadClients();
    await loadActiveClient();
    await loadProxies();
    populateDropdowns();
    renderClients();
    setupEventListeners();
    setupTabNavigation();
});

/**
 * Populates the select dropdowns from CONFIG_MAP
 */
function populateDropdowns() {
    const centerSelect = document.getElementById('center');
    const visaTypeSelect = document.getElementById('visaType');
    const categorySelect = document.getElementById('category');

    // Populate centers
    CONFIG_MAP.centers.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        centerSelect.appendChild(option);
    });

    // Populate visa types
    CONFIG_MAP.visaTypes.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        visaTypeSelect.appendChild(option);
    });

    // Populate categories
    CONFIG_MAP.categories.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        categorySelect.appendChild(option);
    });
}

/**
 * Loads clients from storage
 */
async function loadClients() {
    try {
        const result = await chrome.storage.local.get(['clientDatabase']);
        clients = result.clientDatabase || [];
        console.log(`[Barracks] Loaded ${clients.length} clients`);
    } catch (error) {
        console.error('[Barracks] Failed to load clients:', error);
        clients = [];
    }
}

/**
 * Loads the active client ID
 */
async function loadActiveClient() {
    try {
        const result = await chrome.storage.local.get(['activeClient']);
        if (result.activeClient?.id) {
            activeClientId = result.activeClient.id;
        }
    } catch (error) {
        console.error('[Barracks] Failed to load active client:', error);
    }
}

/**
 * Saves clients to storage
 */
async function saveClients() {
    try {
        await chrome.storage.local.set({ clientDatabase: clients });
        console.log(`[Barracks] Saved ${clients.length} clients`);
    } catch (error) {
        console.error('[Barracks] Failed to save clients:', error);
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners() {
    // Add client button
    elements.btnAddClient.addEventListener('click', () => openModal());

    // Close modal buttons
    elements.btnCloseModal.addEventListener('click', closeModal);
    elements.btnCancel.addEventListener('click', closeModal);
    elements.modalOverlay.addEventListener('click', (e) => {
        if (e.target === elements.modalOverlay) closeModal();
    });

    // Form submission
    elements.clientForm.addEventListener('submit', handleFormSubmit);

    // Import/Export
    elements.btnImport.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', handleImport);
    elements.btnExport.addEventListener('click', handleExport);

    // Photo upload
    document.getElementById('btnSelectPhoto').addEventListener('click', () => {
        document.getElementById('profilePhoto').click();
    });
    document.getElementById('profilePhoto').addEventListener('change', handlePhotoSelect);
    document.getElementById('btnRemovePhoto').addEventListener('click', removePhoto);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

/**
 * Handles photo file selection
 */
function handlePhotoSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    // Max size 500KB
    if (file.size > 500 * 1024) {
        alert('Image too large. Please select an image under 500KB');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        currentPhotoData = event.target.result;
        updatePhotoPreview(currentPhotoData);
    };
    reader.readAsDataURL(file);
}

/**
 * Updates the photo preview in the form
 */
function updatePhotoPreview(dataUrl) {
    const preview = document.getElementById('photoPreview');
    const removeBtn = document.getElementById('btnRemovePhoto');

    if (dataUrl) {
        preview.innerHTML = `<img src="${dataUrl}" alt="Profile">`;
        removeBtn.classList.remove('hidden-input');
    } else {
        preview.innerHTML = '<span class="photo-placeholder">👤</span>';
        removeBtn.classList.add('hidden-input');
    }
}

/**
 * Removes the current photo
 */
function removePhoto() {
    currentPhotoData = null;
    document.getElementById('profilePhoto').value = '';
    updatePhotoPreview(null);
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Renders the client table
 */
function renderClients() {
    // Update count
    elements.clientCount.textContent = `${clients.length} Client${clients.length !== 1 ? 's' : ''}`;

    // Update active indicator
    const activeClient = clients.find(c => c.id === activeClientId);
    if (activeClient) {
        elements.activeClientName.textContent = `${activeClient.firstName} ${activeClient.lastName}`;
        elements.activeIndicator.style.display = 'flex';
    } else {
        elements.activeClientName.textContent = 'No Active Client';
        elements.activeIndicator.style.display = 'flex';
    }

    // Show/hide empty state
    if (clients.length === 0) {
        elements.clientTableBody.innerHTML = '';
        elements.emptyState.classList.add('visible');
        return;
    }

    elements.emptyState.classList.remove('visible');

    // Render table rows with photos
    elements.clientTableBody.innerHTML = clients.map(client => {
        const photoHtml = client.photoData
            ? `<img src="${client.photoData}" class="client-photo" alt="">`
            : '';
        const visaTypeName = CONFIG_MAP.visaTypes.find(v => v.id === client.visaType)?.name || client.visaType || '-';

        return `
    <tr class="${client.id === activeClientId ? 'active' : ''}" data-id="${client.id}">
      <td>
        <span class="status-badge ${client.id === activeClientId ? 'active' : 'inactive'}">
          ${client.id === activeClientId ? '● Active' : '○ Idle'}
        </span>
      </td>
      <td>
        <div class="client-name-cell">
          ${photoHtml}
          <strong>${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}</strong>
        </div>
      </td>
      <td>${escapeHtml(client.email)}</td>
      <td>${escapeHtml(visaTypeName)}</td>
      <td>${escapeHtml(client.passportNumber)}</td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-success btn-sm" data-action="activate" data-client-id="${client.id}" 
                  ${client.id === activeClientId ? 'disabled' : ''}>
            🎯 ${client.id === activeClientId ? 'Loaded' : 'Activate'}
          </button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-client-id="${client.id}">
            ✏️ Edit
          </button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-client-id="${client.id}">
            🗑️
          </button>
        </div>
      </td>
    </tr>
  `}).join('');

    // Attach event delegation for action buttons
    setupTableEventDelegation();
}

/**
 * Escapes HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// MODAL HANDLING
// ============================================================================

/**
 * Opens the modal for adding/editing
 */
function openModal(clientId = null) {
    editingClientId = clientId;
    currentPhotoData = null;

    if (clientId) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            elements.modalTitle.textContent = 'Edit Client';
            populateForm(client);
            currentPhotoData = client.photoData || null;
            updatePhotoPreview(currentPhotoData);
        }
    } else {
        elements.modalTitle.textContent = 'Add New Client';
        elements.clientForm.reset();
        document.getElementById('clientId').value = '';
        updatePhotoPreview(null);
    }

    elements.modalOverlay.classList.add('visible');
    document.getElementById('email').focus();
}

/**
 * Closes the modal
 */
function closeModal() {
    elements.modalOverlay.classList.remove('visible');
    elements.clientForm.reset();
    editingClientId = null;
    currentPhotoData = null;
    updatePhotoPreview(null);
}

/**
 * Populates form with client data
 */
function populateForm(client) {
    document.getElementById('clientId').value = client.id || '';
    document.getElementById('email').value = client.email || '';
    document.getElementById('password').value = client.password || '';
    document.getElementById('otpSecret').value = client.otpSecret || '';
    document.getElementById('center').value = client.center || '';
    document.getElementById('visaType').value = client.visaType || '';
    document.getElementById('visaSubType').value = client.visaSubType || '';
    document.getElementById('category').value = client.category || '';
    document.getElementById('firstName').value = client.firstName || '';
    document.getElementById('lastName').value = client.lastName || '';
    document.getElementById('dateOfBirth').value = client.dateOfBirth || '';
    document.getElementById('nationality').value = client.nationality || '';
    document.getElementById('passportNumber').value = client.passportNumber || '';
    document.getElementById('passportExpiry').value = client.passportExpiry || '';
    document.getElementById('issuePlace').value = client.issuePlace || '';
    document.getElementById('phone').value = client.phone || '';
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Handles form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const clientData = {
        id: document.getElementById('clientId').value || generateId(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value,
        otpSecret: document.getElementById('otpSecret').value.trim(),
        center: document.getElementById('center').value,
        visaType: document.getElementById('visaType').value,
        visaSubType: document.getElementById('visaSubType').value.trim(),
        category: document.getElementById('category').value,
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        dateOfBirth: document.getElementById('dateOfBirth').value,
        nationality: document.getElementById('nationality').value.trim(),
        passportNumber: document.getElementById('passportNumber').value.trim(),
        passportExpiry: document.getElementById('passportExpiry').value,
        issuePlace: document.getElementById('issuePlace').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        photoData: currentPhotoData,
        updatedAt: Date.now()
    };

    if (editingClientId) {
        // Update existing client
        const index = clients.findIndex(c => c.id === editingClientId);
        if (index !== -1) {
            clientData.createdAt = clients[index].createdAt;
            clients[index] = clientData;
        }
    } else {
        // Add new client
        clientData.createdAt = Date.now();
        clients.push(clientData);
    }

    await saveClients();
    renderClients();
    closeModal();
}

/**
 * Edits a client
 */
function editClient(id) {
    openModal(id);
}

/**
 * Deletes a client
 */
async function deleteClient(id) {
    const client = clients.find(c => c.id === id);
    if (!client) return;

    if (!confirm(`Delete ${client.firstName} ${client.lastName}?`)) {
        return;
    }

    clients = clients.filter(c => c.id !== id);

    // If this was the active client, clear it
    if (activeClientId === id) {
        activeClientId = null;
        await chrome.storage.local.remove(['activeClient']);
        chrome.runtime.sendMessage({ type: 'SET_ACTIVE_CLIENT', payload: null });
    }

    await saveClients();
    renderClients();
}

/**
 * Activates a client for use
 */
async function activateClient(id) {
    const client = clients.find(c => c.id === id);
    if (!client) return;

    activeClientId = id;

    // Save to storage and notify background
    await chrome.storage.local.set({ activeClient: client });

    chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_CLIENT',
        payload: client
    }, (response) => {
        if (response?.success) {
            console.log(`[Barracks] Activated client: ${client.firstName}`);
        }
    });

    renderClients();
}

/**
 * Sets up event delegation for table action buttons (CSP-compliant)
 */
function setupTableEventDelegation() {
    const tableBody = document.getElementById('clientTableBody');
    if (!tableBody) return;

    // Remove existing listener to prevent duplicates
    tableBody.removeEventListener('click', handleTableClick);
    tableBody.addEventListener('click', handleTableClick);
}

/**
 * Handles clicks on table action buttons via event delegation
 */
function handleTableClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const clientId = button.dataset.clientId;

    switch (action) {
        case 'activate':
            activateClient(clientId);
            break;
        case 'edit':
            editClient(clientId);
            break;
        case 'delete':
            deleteClient(clientId);
            break;
    }
}

// ============================================================================
// IMPORT/EXPORT
// ============================================================================

/**
 * Handles JSON import
 */
async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const imported = JSON.parse(text);

        if (!Array.isArray(imported)) {
            throw new Error('Invalid format - expected array');
        }

        // Validate and assign IDs if missing
        const validClients = imported.map(client => ({
            ...client,
            id: client.id || generateId(),
            createdAt: client.createdAt || Date.now()
        }));

        // Ask to merge or replace
        const action = confirm(
            `Import ${validClients.length} clients?\n\n` +
            `OK = Merge with existing\n` +
            `Cancel = Abort import`
        );

        if (!action) return;

        // Merge (avoid duplicates by email)
        const existingEmails = new Set(clients.map(c => c.email));
        const newClients = validClients.filter(c => !existingEmails.has(c.email));

        clients = [...clients, ...newClients];
        await saveClients();
        renderClients();

        alert(`Imported ${newClients.length} new clients (${validClients.length - newClients.length} duplicates skipped)`);

    } catch (error) {
        alert(`Import failed: ${error.message}`);
    }

    // Reset file input
    e.target.value = '';
}

/**
 * Exports clients to JSON
 */
function handleExport() {
    if (clients.length === 0) {
        alert('No clients to export');
        return;
    }

    const data = JSON.stringify(clients, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity_clients_${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Generates a unique ID
 */
function generateId() {
    return 'client_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

/**
 * Sets up tab switching functionality
 */
function setupTabNavigation() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            switchTab(tabId);
        });
    });
}

/**
 * Switches to a specific tab
 */
function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update panels
    document.getElementById('tabClients').classList.toggle('active', tabId === 'clients');
    document.getElementById('tabProxies').classList.toggle('active', tabId === 'proxies');
    document.getElementById('tabSettings').classList.toggle('active', tabId === 'settings');
}

// ============================================================================
// PROXY MANAGEMENT
// ============================================================================

let proxyList = [];

/**
 * Loads proxies from storage into the textarea
 */
async function loadProxies() {
    try {
        // FIXED: Read from 'proxies' key (matching proxy_manager.js)
        const result = await chrome.storage.local.get(['proxies', 'currentProxyIndex']);
        proxyList = result.proxies || [];

        // Populate textarea
        const textarea = document.getElementById('proxyTextarea');
        if (textarea) {
            textarea.value = proxyList.join('\n');
        }
        updateProxyCount();

        console.log(`[Barracks] Loaded ${proxyList.length} proxies (Index: ${result.currentProxyIndex || 0})`);
    } catch (error) {
        console.error('[Barracks] Failed to load proxies:', error);
    }
}

/**
 * Saves proxies from textarea to storage
 */
async function saveProxies() {
    const textarea = document.getElementById('proxyTextarea');
    if (!textarea) {
        console.error('[Barracks] Proxy textarea not found!');
        return;
    }

    // Parse: split by newline, trim each line, filter empty lines
    const lines = textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    // Validate each proxy (ip:port or ip:port:user:pass)
    const validProxies = [];
    const invalidLines = [];

    const proxyRegex = /^[\w.-]+:\d+(:[^:]+:[^:]+)?$/;

    lines.forEach((line, index) => {
        if (proxyRegex.test(line)) {
            validProxies.push(line);
        } else {
            invalidLines.push(index + 1);
        }
    });

    if (invalidLines.length > 0) {
        showProxyStatus(`Invalid format on line(s): ${invalidLines.join(', ')}`, 'error');
        return;
    }

    try {
        proxyList = validProxies;

        // FIXED: Save to 'proxies' key (matching proxy_manager.js) and reset index
        await chrome.storage.local.set({
            proxies: proxyList,
            currentProxyIndex: 0  // Reset to first proxy when list changes
        });

        updateProxyCount();
        showProxyStatus(`✅ Saved ${proxyList.length} proxies successfully!`, 'success');

        console.log(`[Barracks] Saved ${proxyList.length} proxies to storage`);
    } catch (error) {
        console.error('[Barracks] Failed to save proxies:', error);
        showProxyStatus(`Failed to save: ${error.message}`, 'error');
    }
}

/**
 * Clears all proxies
 */
async function clearProxies() {
    if (!confirm('Clear all proxies?')) return;

    document.getElementById('proxyTextarea').value = '';
    proxyList = [];
    // FIXED: Use 'proxies' key to match proxy_manager.js
    await chrome.storage.local.set({ proxies: [], currentProxyIndex: 0 });
    updateProxyCount();
    showProxyStatus('Proxies cleared', 'info');
}

/**
 * Tests all proxies (visual feedback only)
 */
function testProxies() {
    if (proxyList.length === 0) {
        showProxyStatus('No proxies to test', 'error');
        return;
    }
    showProxyStatus(`🧪 Testing ${proxyList.length} proxies... (Feature coming soon)`, 'info');
}

/**
 * Updates the proxy count display
 */
function updateProxyCount() {
    document.getElementById('proxyCount').textContent =
        `${proxyList.length} Prox${proxyList.length !== 1 ? 'ies' : 'y'} Loaded`;
}

/**
 * Shows a status message in the proxy section
 */
function showProxyStatus(message, type = 'info') {
    const status = document.getElementById('proxyStatus');
    status.textContent = message;
    status.className = `proxy-status ${type}`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        status.className = 'proxy-status';
    }, 5000);
}

// Set up proxy button listeners
document.getElementById('btnSaveProxies')?.addEventListener('click', saveProxies);
document.getElementById('btnTestProxies')?.addEventListener('click', testProxies);
document.getElementById('btnClearProxies')?.addEventListener('click', clearProxies);

// ============================================================================
// SETTINGS MANAGEMENT
// ============================================================================

let globalSettings = {
    captchaProvider: 'nocaptchaai',
    captchaApiKey: '',
    telegramBotToken: '',
    telegramChatId: '',
    headlessMode: false,
    soundEnabled: true,
    autoLoginEnabled: true
};

/**
 * Loads settings from storage
 */
async function loadSettings() {
    try {
        const result = await chrome.storage.local.get(['globalSettings']);
        if (result.globalSettings) {
            globalSettings = { ...globalSettings, ...result.globalSettings };
        }

        // Populate form fields
        document.getElementById('captchaProvider').value = globalSettings.captchaProvider;
        document.getElementById('captchaApiKey').value = globalSettings.captchaApiKey;
        document.getElementById('telegramBotToken').value = globalSettings.telegramBotToken;
        document.getElementById('telegramChatId').value = globalSettings.telegramChatId;
        document.getElementById('headlessMode').checked = globalSettings.headlessMode;
        document.getElementById('soundEnabled').checked = globalSettings.soundEnabled;
        document.getElementById('autoLoginEnabled').checked = globalSettings.autoLoginEnabled;

        console.log('[Barracks] Settings loaded');
    } catch (error) {
        console.error('[Barracks] Failed to load settings:', error);
    }
}

/**
 * Saves settings to storage
 */
async function saveSettings() {
    globalSettings = {
        captchaProvider: document.getElementById('captchaProvider').value,
        captchaApiKey: document.getElementById('captchaApiKey').value,
        telegramBotToken: document.getElementById('telegramBotToken').value,
        telegramChatId: document.getElementById('telegramChatId').value,
        headlessMode: document.getElementById('headlessMode').checked,
        soundEnabled: document.getElementById('soundEnabled').checked,
        autoLoginEnabled: document.getElementById('autoLoginEnabled').checked
    };

    try {
        await chrome.storage.local.set({ globalSettings });
        showSettingsStatus('✅ Settings saved successfully!', 'success');
        console.log('[Barracks] Settings saved');
    } catch (error) {
        showSettingsStatus(`Failed to save: ${error.message}`, 'error');
    }
}

/**
 * Tests Telegram notification
 */
function testTelegram() {
    const botToken = document.getElementById('telegramBotToken').value;
    const chatId = document.getElementById('telegramChatId').value;

    if (!botToken || !chatId) {
        showSettingsStatus('⚠️ Please enter Bot Token and Chat ID first', 'error');
        return;
    }

    showSettingsStatus('📨 Sending test notification...', 'success');

    chrome.runtime.sendMessage({
        type: 'TEST_TELEGRAM',
        payload: { botToken, chatId }
    }, (response) => {
        if (response?.success) {
            showSettingsStatus('✅ Test notification sent!', 'success');
        } else {
            showSettingsStatus(`❌ Failed: ${response?.error || 'Unknown error'}`, 'error');
        }
    });
}

/**
 * Shows settings status message
 */
function showSettingsStatus(message, type = 'success') {
    const status = document.getElementById('settingsStatus');
    status.textContent = message;
    status.className = `settings-status ${type}`;

    setTimeout(() => {
        status.className = 'settings-status';
    }, 5000);
}

// Set up settings button listeners
document.getElementById('btnSaveSettings')?.addEventListener('click', saveSettings);
document.getElementById('btnTestTelegram')?.addEventListener('click', testTelegram);

// Load settings on init (add to DOMContentLoaded)
loadSettings();
