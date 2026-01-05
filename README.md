# 🛸 Antigravity Operator (BLS Ultimate)

**Version:** 1.2.4  
**Type:** Advanced Browser Automation Extension & Control Server

## 🚀 Overview
Antigravity Operator is a high-performance, stealth-focused browser automation system designed for BLS Visa portals (Spain/Morocco/Portugal). It features "Perfect Retry" technology to bypass anti-bot detections (429/403 blocks) by simulating a completely fresh user identity on every proxy rotation, alongside human-like interaction patterns.

---

## ✨ Key Features

### 🛡️ Stealth & Anti-Detection
*   **Perfect Retry System ("Aggressive Wipe"):**
    *   Automatically clears **ALL** storage, cookies, caches, service workers, and local data globally on every proxy rotation.
    *   **Marker Detection:** Uses `localStorage` markers to detect if `sessionStorage` leaked across reloads (a common detection vector) and forces a fingerprint regeneration.
*   **Session-Consistent Fingerprinting (`fingerprint_spoof.js`):**
    *   Generates a unique, persistent hardware fingerprint (Canvas, WebGL, Screen, Hardware Concurrency) for each session.
    *   Runs in the **MAIN** world context to bypass Content Security Policy (CSP) detection.
    *   Hides `navigator.webdriver` usage properly.
*   **Human-Like Interaction (`login_manager.js`):**
    *   **`humanClick()`:** Simulates realistic mouse movements (hover, pause, click) instead of robotic JS clicks.
    *   **`simulateTyping()`:** Uses proper `KeyboardEvent` (keydown/press/up) and `InputEvent` sequences with randomized human-like typing speeds (50-130ms delays).

### 🤖 Smart Automation
*   **Dynamic Login Handling:**
    *   Supports 2-step login flows (Email -> Verify -> Password).
    *   Auto-detects page states (Login, OTP, Dashboard, Booking Gate).
*   **Captcha Solving:**
    *   **Grid Captcha:** Automated solving for login and booking gates.
    *   **Text Captcha:** Fallback support for older text-based challenges.
*   **Booking Gate Logic (`navigator.js`):**
    *   Automatically solves the booking gate grid captcha.
    *   **Auto-Submit:** Clicks the submit/verify button immediately after solving using stealth clicks.

### 🌐 Infrastructure
*   **Intelligent Proxy Rotation:**
    *   Monitors request blocks (429/403).
    *   Triggers automatic rotation with cooldowns.
    *   Blacklists bad proxies/subnets.
*   **Control Server:**
    *   Node.js server for managing accounts/slots/configs (implied).

---

## 📂 Project Structure

### Extension (`/extension`)
| File | Role |
|------|------|
| `manifest.json` | Extension configuration. Defines permissions and content scripts (Main/Isolated worlds). |
| `background.js` | **Brain**. Handles proxy rotation, aggressive storage wiping, and request monitoring (declarativeNetRequest). |
| `content.js` | **Observer**. Detects page state (Login, Blocked, Booking) and coordinates actions. |
| `login_manager.js` | **Actor**. Handles login forms, fields, and executes human event simulations (`humanClick`, `simulateTyping`). |
| `navigator.js` | **Pilot**. Manages the booking flow, booking gate captcha, and slot searching. |
| `fingerprint_spoof.js` | **Mask**. Injected script (Main World) that spoofs browser fingerprints consistently. |
| `captcha_service.js` | **Solver**. Logic for processing and solving captcha challenges. |
| `proxy_manager.js` | **Network**. Manages proxy list and rotation logic. |
| `stealth.js` | **Header Spoofing**. Rotates User-Agent headers at the network level. |

### Server (`/server`)
*   Contains the Node.js backend for centralized control (Session management, API handling).

---

## 🛠️ Usage & Setup

1.  **Load Extension:**
    *   Open Chrome -> `chrome://extensions`
    *   Enable **Developer Mode**.
    *   Click **Load Unpacked**.
    *   Select the `/bls ultimate/extension` folder.

2.  **Configuration:**
    *   Click the extension icon -> **Options**.
    *   Enter API Keys (Captcha, etc.).
    *   Configure Proxy List.

3.  **Run:**
    *   Navigate to BLS login page.
    *   The extension will auto-detect "LOGIN" state and assume control.
    *   Open Console (F12) to see `[Antigravity]` logs.

---

## ⚠️ Troubleshooting
*   **"Blocked After Rotation"**: Means the proxy IP itself is flagged. The extension has wiped all data, so the Block is purely IP-based. Switch proxy providers.
*   **"Grid Captcha Failed"**: Check 2Captcha/anti-captcha API balance.
