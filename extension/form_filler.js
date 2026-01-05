/**
 * Antigravity Operator - Form Filler (Agent D)
 * 
 * Handles automatic form filling for applicant details.
 * Uses trusted event dispatching to trigger BLS validation scripts
 * and interacts with Kendo UI dropdowns correctly.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const FORM_FILLER_CONFIG = {
    // Timing delays for realistic human-like interaction
    delays: {
        betweenFields: 150,      // Delay between filling each field
        afterFocus: 50,          // Delay after focusing before typing
        afterInput: 100,         // Delay after input before blur
        dropdownOpen: 200,       // Delay for dropdown to open
        dropdownSelect: 150      // Delay for dropdown selection
    },

    // Field selectors for applicant form
    selectors: {
        firstName: '#FirstName, input[name="FirstName"], input[id*="FirstName"]',
        lastName: '#LastName, input[name="LastName"], input[id*="LastName"]',
        passportNumber: '#PassportNumber, input[name="PassportNumber"], input[id*="Passport"]',
        dateOfBirth: '#DateOfBirth, input[name="DateOfBirth"], input[id*="DateOfBirth"], input[id*="DOB"]',
        nationality: '#Nationality, select[name="Nationality"], input[id*="Nationality"]',
        email: '#Email, input[name="Email"], input[type="email"]',
        phone: '#Phone, #PhoneNumber, input[name="Phone"], input[id*="Phone"]',
        gender: '#Gender, select[name="Gender"]',

        // Kendo UI dropdown selectors
        kendoDropdown: '.k-dropdown, .k-widget.k-dropdown',
        kendoInput: '.k-input, .k-input-inner',
        kendoList: '.k-list, .k-popup .k-list-ul',
        kendoItem: '.k-list-item, .k-item',

        // Submit button
        submitButton: '#btnSubmit, button[type="submit"], input[type="submit"], .btn-submit'
    }
};

// ============================================================================
// TRUSTED EVENT DISPATCHING
// ============================================================================

/**
 * Dispatches a trusted-like event on an element.
 * This mimics real user interaction to trigger validation scripts.
 * 
 * @param {HTMLElement} element - Target element
 * @param {string} eventType - Event type (click, focus, input, blur, change)
 * @param {Object} options - Additional event options
 */
function dispatchTrustedEvent(element, eventType, options = {}) {
    if (!element) return;

    let event;

    switch (eventType) {
        case 'click':
        case 'mousedown':
        case 'mouseup':
            event = new MouseEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window,
                ...options
            });
            break;

        case 'focus':
        case 'blur':
        case 'focusin':
        case 'focusout':
            event = new FocusEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window,
                ...options
            });
            break;

        case 'input':
        case 'change':
            event = new Event(eventType, {
                bubbles: true,
                cancelable: true,
                ...options
            });
            break;

        case 'keydown':
        case 'keyup':
        case 'keypress':
            event = new KeyboardEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window,
                ...options
            });
            break;

        default:
            event = new Event(eventType, { bubbles: true, cancelable: true });
    }

    element.dispatchEvent(event);
}

/**
 * Simulates a complete user interaction sequence on an input.
 * 
 * @param {HTMLElement} element - Target input element
 * @param {string} value - Value to set
 */
async function simulateUserInput(element, value) {
    if (!element || value === undefined || value === null) return;

    const { delays } = FORM_FILLER_CONFIG;

    // Focus sequence
    dispatchTrustedEvent(element, 'mousedown');
    dispatchTrustedEvent(element, 'mouseup');
    dispatchTrustedEvent(element, 'click');
    dispatchTrustedEvent(element, 'focusin');
    dispatchTrustedEvent(element, 'focus');

    await sleep(delays.afterFocus);

    // Clear existing value
    element.value = '';
    dispatchTrustedEvent(element, 'input');

    // Type character by character for more realistic simulation
    const valueStr = String(value);
    for (let i = 0; i < valueStr.length; i++) {
        element.value = valueStr.substring(0, i + 1);
        dispatchTrustedEvent(element, 'keydown', { key: valueStr[i] });
        dispatchTrustedEvent(element, 'keypress', { key: valueStr[i] });
        dispatchTrustedEvent(element, 'input');
        dispatchTrustedEvent(element, 'keyup', { key: valueStr[i] });
        await sleep(20 + Math.random() * 30); // Variable typing speed
    }

    await sleep(delays.afterInput);

    // Blur sequence
    dispatchTrustedEvent(element, 'change');
    dispatchTrustedEvent(element, 'focusout');
    dispatchTrustedEvent(element, 'blur');
}

/**
 * Quick value set without character-by-character typing.
 * Used when speed is more important than stealth.
 * 
 * @param {HTMLElement} element - Target input element
 * @param {string} value - Value to set
 */
async function quickSetValue(element, value) {
    if (!element || value === undefined || value === null) return;

    dispatchTrustedEvent(element, 'focus');

    // Set value directly
    element.value = String(value);

    // Trigger all necessary events
    dispatchTrustedEvent(element, 'input');
    dispatchTrustedEvent(element, 'change');
    dispatchTrustedEvent(element, 'blur');
}

// ============================================================================
// KENDO UI DROPDOWN HANDLING
// ============================================================================

/**
 * Fills a Kendo UI dropdown by value or text.
 * 
 * @param {string} selector - Selector for the dropdown or its hidden input
 * @param {string} value - Value or text to select
 * @returns {Promise<boolean>} Success status
 */
async function fillKendoDropdown(selector, value) {
    const { delays, selectors } = FORM_FILLER_CONFIG;

    // Find the element
    const element = document.querySelector(selector);
    if (!element) {
        console.warn(`[FormFiller] Dropdown not found: ${selector}`);
        return false;
    }

    // Find the Kendo wrapper
    let kendoWrapper = element.closest('.k-dropdown') ||
        element.closest('.k-widget') ||
        element.parentElement.querySelector('.k-dropdown');

    // If it's a regular select, find the Kendo wrapper
    if (!kendoWrapper && element.tagName === 'SELECT') {
        kendoWrapper = element.parentElement.querySelector('.k-dropdown');
    }

    if (!kendoWrapper) {
        // Fallback: try regular select handling
        if (element.tagName === 'SELECT') {
            return fillRegularSelect(element, value);
        }
        console.warn(`[FormFiller] Kendo wrapper not found for: ${selector}`);
        return false;
    }

    // Click to open dropdown
    const clickTarget = kendoWrapper.querySelector('.k-input, .k-select, .k-dropdown-wrap') || kendoWrapper;
    dispatchTrustedEvent(clickTarget, 'click');

    await sleep(delays.dropdownOpen);

    // Find the dropdown list (usually appended to body)
    const listContainer = document.querySelector('.k-animation-container:not(.k-animation-container-hidden)') ||
        document.querySelector('.k-popup:not(.k-hidden)');

    if (!listContainer) {
        console.warn('[FormFiller] Dropdown list not found');
        return false;
    }

    // Find matching item
    const items = listContainer.querySelectorAll('.k-list-item, .k-item, li');
    let matchedItem = null;

    for (const item of items) {
        const itemText = item.textContent?.trim().toLowerCase();
        const itemValue = item.getAttribute('data-value') || item.getAttribute('data-offset-index');

        if (itemText === String(value).toLowerCase() ||
            itemValue === String(value) ||
            itemText?.includes(String(value).toLowerCase())) {
            matchedItem = item;
            break;
        }
    }

    if (!matchedItem) {
        // Try first available item if no match
        matchedItem = items[0];
        console.warn(`[FormFiller] No exact match for "${value}", selecting first item`);
    }

    if (matchedItem) {
        dispatchTrustedEvent(matchedItem, 'click');
        await sleep(delays.dropdownSelect);
        return true;
    }

    return false;
}

/**
 * Fills a regular HTML select element.
 * 
 * @param {HTMLSelectElement} select - Select element
 * @param {string} value - Value or text to select
 * @returns {Promise<boolean>} Success status
 */
async function fillRegularSelect(select, value) {
    if (!select || select.tagName !== 'SELECT') return false;

    // Try to find option by value
    let option = select.querySelector(`option[value="${value}"]`);

    // Try by text content
    if (!option) {
        const options = select.querySelectorAll('option');
        for (const opt of options) {
            if (opt.textContent?.trim().toLowerCase().includes(String(value).toLowerCase())) {
                option = opt;
                break;
            }
        }
    }

    if (option) {
        select.value = option.value;
        dispatchTrustedEvent(select, 'change');
        return true;
    }

    return false;
}

// ============================================================================
// DATE FIELD HANDLING
// ============================================================================

/**
 * Fills a date field (Kendo DatePicker or standard input).
 * 
 * @param {string} selector - Selector for the date input
 * @param {string} dateValue - Date value (various formats accepted)
 * @returns {Promise<boolean>} Success status
 */
async function fillDateField(selector, dateValue) {
    const element = document.querySelector(selector);
    if (!element) return false;

    // Normalize date format
    let formattedDate = dateValue;

    // Try to parse and reformat
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            // Format as DD/MM/YYYY (common BLS format)
            formattedDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        }
    } catch (e) {
        // Keep original format
    }

    // Check if it's a Kendo DatePicker
    const kendoWrapper = element.closest('.k-datepicker') ||
        element.closest('.k-widget');

    if (kendoWrapper) {
        // Use Kendo's internal API if available
        const kendoInput = kendoWrapper.querySelector('input');
        if (kendoInput) {
            await quickSetValue(kendoInput, formattedDate);

            // Trigger Kendo's change
            const kendoWidget = $(kendoInput)?.data?.('kendoDatePicker');
            if (kendoWidget) {
                try {
                    kendoWidget.value(new Date(dateValue));
                    kendoWidget.trigger('change');
                } catch (e) {
                    console.warn('[FormFiller] Kendo DatePicker API failed:', e);
                }
            }

            return true;
        }
    }

    // Standard input handling
    await quickSetValue(element, formattedDate);
    return true;
}

// ============================================================================
// MAIN FORM FILLING FUNCTION
// ============================================================================

/**
 * Fills the applicant details form with provided client data.
 * 
 * @param {Object} clientData - Client data object
 * @param {string} clientData.firstName - First name
 * @param {string} clientData.lastName - Last name
 * @param {string} clientData.passportNumber - Passport number
 * @param {string} clientData.nationality - Nationality
 * @param {string} clientData.dateOfBirth - Date of birth
 * @param {string} clientData.email - Email address
 * @param {string} clientData.phone - Phone number
 * @param {string} clientData.gender - Gender
 * @returns {Promise<Object>} Result object with filled fields
 */
async function fillApplicantForm(clientData) {
    console.log('[FormFiller] 📝 Starting form fill...', clientData);

    if (!clientData) {
        return { success: false, error: 'No client data provided' };
    }

    const { selectors, delays } = FORM_FILLER_CONFIG;
    const filledFields = [];
    const failedFields = [];

    // Helper to fill a text field
    async function fillTextField(selectorKey, value) {
        if (!value) return;

        const selector = selectors[selectorKey];
        const element = document.querySelector(selector);

        if (element) {
            await simulateUserInput(element, value);
            filledFields.push(selectorKey);
            console.log(`[FormFiller] ✓ Filled ${selectorKey}`);
        } else {
            failedFields.push(selectorKey);
            console.warn(`[FormFiller] ✗ Field not found: ${selectorKey}`);
        }

        await sleep(delays.betweenFields);
    }

    try {
        // Fill text fields
        await fillTextField('firstName', clientData.firstName);
        await fillTextField('lastName', clientData.lastName);
        await fillTextField('passportNumber', clientData.passportNumber);
        await fillTextField('email', clientData.email);
        await fillTextField('phone', clientData.phone);

        // Fill date field
        if (clientData.dateOfBirth) {
            const dateSuccess = await fillDateField(selectors.dateOfBirth, clientData.dateOfBirth);
            if (dateSuccess) {
                filledFields.push('dateOfBirth');
                console.log('[FormFiller] ✓ Filled dateOfBirth');
            } else {
                failedFields.push('dateOfBirth');
            }
            await sleep(delays.betweenFields);
        }

        // Fill nationality dropdown
        if (clientData.nationality) {
            const natSuccess = await fillKendoDropdown(selectors.nationality, clientData.nationality);
            if (natSuccess) {
                filledFields.push('nationality');
                console.log('[FormFiller] ✓ Filled nationality');
            } else {
                failedFields.push('nationality');
            }
            await sleep(delays.betweenFields);
        }

        // Fill gender dropdown
        if (clientData.gender) {
            const genderSuccess = await fillKendoDropdown(selectors.gender, clientData.gender);
            if (genderSuccess) {
                filledFields.push('gender');
                console.log('[FormFiller] ✓ Filled gender');
            } else {
                failedFields.push('gender');
            }
        }

        console.log(`[FormFiller] ✅ Form fill complete. Filled: ${filledFields.length}, Failed: ${failedFields.length}`);

        // Broadcast completion
        chrome.runtime.sendMessage({
            type: 'FORM_FILLED',
            payload: { filledFields, failedFields }
        }).catch(() => { });

        return {
            success: true,
            filledFields,
            failedFields,
            totalFilled: filledFields.length,
            totalFailed: failedFields.length
        };

    } catch (error) {
        console.error('[FormFiller] Form fill error:', error);
        return {
            success: false,
            error: error.message,
            filledFields,
            failedFields
        };
    }
}

// ============================================================================
// LIVENESS HANDLER
// ============================================================================

/**
 * Handles the liveness verification step.
 * Monitors for the liveness button and manages the verification flow.
 */
async function handleLiveness() {
    console.log('[FormFiller] 👁️ Liveness handler activated');

    // Selectors for liveness elements
    const livenessSelectors = [
        '#btnStartLiveness',
        'button[id*="liveness"]',
        'button[class*="liveness"]',
        '.liveness-start',
        'button:contains("Start")',
        '[data-action="liveness"]'
    ];

    // Find liveness button
    let livenessButton = null;
    for (const selector of livenessSelectors) {
        livenessButton = document.querySelector(selector);
        if (livenessButton) break;
    }

    if (!livenessButton) {
        // Set up observer to wait for button
        return new Promise((resolve) => {
            const observer = new MutationObserver((mutations, obs) => {
                for (const selector of livenessSelectors) {
                    const btn = document.querySelector(selector);
                    if (btn) {
                        obs.disconnect();
                        handleLivenessButton(btn).then(resolve);
                        return;
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                observer.disconnect();
                resolve({ success: false, error: 'Liveness button not found within timeout' });
            }, 30000);
        });
    }

    return handleLivenessButton(livenessButton);
}

/**
 * Handles the actual liveness button interaction.
 * 
 * @param {HTMLElement} button - The liveness button
 * @returns {Promise<Object>} Result
 */
async function handleLivenessButton(button) {
    console.log('[FormFiller] Found liveness button, preparing...');

    // Notify that liveness is ready
    chrome.runtime.sendMessage({
        type: 'LIVENESS_READY',
        payload: { buttonFound: true }
    }).catch(() => { });

    // Wait for user action or auto-proceed based on config
    return new Promise((resolve) => {
        // Listen for proceed signal
        const messageHandler = (message) => {
            if (message.type === 'PROCEED_LIVENESS') {
                chrome.runtime.onMessage.removeListener(messageHandler);

                // Click the liveness button
                dispatchTrustedEvent(button, 'click');

                console.log('[FormFiller] Liveness button clicked');

                resolve({
                    success: true,
                    action: 'clicked'
                });
            }
        };

        chrome.runtime.onMessage.addListener(messageHandler);

        // Auto-timeout after 2 minutes
        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(messageHandler);
            resolve({
                success: false,
                error: 'Liveness proceed timeout'
            });
        }, 120000);
    });
}

/**
 * Waits for liveness verification to complete.
 * 
 * @returns {Promise<Object>} Completion result
 */
async function waitForLivenessComplete() {
    console.log('[FormFiller] Waiting for liveness completion...');

    return new Promise((resolve) => {
        // Watch for navigation or success indicators
        const successSelectors = [
            '.liveness-success',
            '.verification-complete',
            '#livenessSuccess',
            '.success-message'
        ];

        const observer = new MutationObserver(() => {
            // Check for success indicators
            for (const selector of successSelectors) {
                if (document.querySelector(selector)) {
                    observer.disconnect();

                    chrome.runtime.sendMessage({
                        type: 'LIVENESS_COMPLETE',
                        payload: { success: true }
                    }).catch(() => { });

                    resolve({ success: true });
                    return;
                }
            }

            // Check for URL change indicating completion
            if (window.location.href.includes('payment') ||
                window.location.href.includes('confirm') ||
                window.location.href.includes('success')) {
                observer.disconnect();
                resolve({ success: true, redirected: true });
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Also listen for navigation
        window.addEventListener('beforeunload', () => {
            observer.disconnect();
            resolve({ success: true, navigated: true });
        }, { once: true });
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates if all required fields are filled
 * @returns {Object} Validation result
 */
function validateForm() {
    const { selectors } = FORM_FILLER_CONFIG;
    const requiredFields = ['firstName', 'lastName', 'passportNumber'];
    const missing = [];

    for (const field of requiredFields) {
        const element = document.querySelector(selectors[field]);
        if (!element?.value?.trim()) {
            missing.push(field);
        }
    }

    return {
        valid: missing.length === 0,
        missingFields: missing
    };
}

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, payload } = message;

    switch (type) {
        case 'FILL_FORM':
            fillApplicantForm(payload)
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'HANDLE_LIVENESS':
            handleLiveness()
                .then(result => sendResponse(result))
                .catch(error => sendResponse({ success: false, error: error.message }));
            return true;

        case 'VALIDATE_FORM':
            sendResponse(validateForm());
            break;
    }

    return false;
});

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof globalThis !== 'undefined') {
    globalThis.AntigravityFormFiller = {
        fillApplicantForm,
        handleLiveness,
        waitForLivenessComplete,
        validateForm,
        fillKendoDropdown,
        fillDateField,
        simulateUserInput,
        quickSetValue,
        FORM_FILLER_CONFIG
    };
}

console.log('[FormFiller] Module loaded');
