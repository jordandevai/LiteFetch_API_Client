# ⚡ LiteFetch
> **The Local-First, Lightweight API Workbench.**
> Built by **Jordan Gonzales (JTech Minds)**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-orange)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-green)
![React](https://img.shields.io/badge/frontend-React%20%2B%20Vite-cyan)

LiteFetch is a blazingly fast, privacy-focused REST client built for developers who want power without the cloud bloat. 

Architected with **Tauri v2**, it combines the performance of a native Rust desktop shell, the flexibility of a **React/Vite** frontend, and the raw power of a local **Python/FastAPI** engine.

---

## LiteFetch Directives

*   **🔒 Local-First & Private:** No cloud sync, no forced logins, no tracking. Your data lives on your disk in human-readable JSON.
*   **📂 Git-Friendly Workspaces:** Collections, environments, and history are stored as standard JSON files. Commit them to Git and collaborate without proprietary enterprise tiers.
*   **⚡ Lightweight Footprint:** Uses the system WebView (WebKit on Linux, WebView2 on Windows) via Tauri, keeping the installer small and RAM usage low.

## Key Features

### 🛠️ Powerful Request Editor
*   **Full Method Support:** GET, POST, PUT, DELETE, PATCH, and more.
*   **Body Masters:** First-class support for `JSON`, `Form-Data` (with file uploads), `x-www-form-urlencoded`, and `Raw` text.
*   **Auth Built-in:** Native support for Basic Auth and Bearer Tokens.
*   **Cookie Jar:** Automatic per-environment cookie management (like a real browser).

### 🔗 "Auto-Magic" Request Chaining
Stop copy-pasting tokens manually. Use **JMESPath** rules to extract data from a response and inject it into your environment variables automatically.
*   *Example:* Login -> Extract `body.token` -> Save to `{{access_token}}` -> Use in next request.

### 🌍 Dynamic Environments
*   Manage sets of variables (`dev`, `staging`, `prod`).
*   Inject variables anywhere: URL, Headers, Body, or Auth fields using `{{variable_name}}` syntax.
*   **Dynamic Generators:** Use `{{$uuid}}`, `{{$timestamp}}`, and `{{$randomInt}}` for testing.

### 📥 Migration Ready
*   **Postman Import:** Import existing Postman collections (v2.1) in seconds.
*   **History Tracking:** Never lose a request. Auto-saves your last 50 executions.


## Development Guide

### Prerequisites
*   **Node.js** v20+
*   **Python** 3.10+ & **Poetry**
*   **Rust** (via `rustup`)

### Linux Setup (Ubuntu/Debian)
Install system dependencies for Tauri and WebKitGTK:
```bash
sudo apt update && sudo apt install -y \
    libwebkit2gtk-4.1-dev build-essential libgtk-3-dev \
    libayatana-appindicator3-dev librsvg2-dev libxdo-dev \
    libssl-dev curl wget file pkg-config patchelf
```

### 🏃‍♂️ Run in Development Mode
This starts the Rust shell, compiles the React frontend with HMR, and spawns the Python backend automatically.

```bash
# 1. Install dependencies
(cd backend && poetry install)
(cd frontend && npm install)

# 2. Start the desktop app
# This will auto-build the sidecar if missing and launch the GUI
npm run tauri:dev 
```

- Hot reloads:
  - Frontend: Vite HMR handles React/TS changes live.
  - Rust shell: `tauri dev` rebuilds/relaunches on Rust/Tauri changes.
- Backend: the Tauri shell auto-starts the packaged sidecar; no separate backend process is needed during desktop dev. If the sidecar is missing/outdated, run `backend/build_sidecar.sh` once to refresh it.

---

## 📦 Building for Production

We provide a one-shot script that handles the entire pipeline: building the Python sidecar (via PyInstaller), compiling the React assets, and bundling the Tauri installer (`.deb` or `.exe`).

```bash
./scripts/build-desktop.sh
```

**Artifacts Location:**
*   **Linux:** `dist/linux/LiteFetch_0.1.0_amd64.deb` (adjust filename for your build).
*   **Windows:** `dist/windows/` (windows distribution not yet tested/built)


## Installation

### Linux
1.  Build the project or download the `.deb`.
2.  Install:
    ```bash
    sudo apt install ./dist/linux/litefetch-desktop_0.1.0_amd64.deb
    ```
3.  Run:
  - From terminal: `litefetch-desktop` (shows backend logs in the shell).
  - From app launcher/icon: runs silently (no logs shown).

### Windows
1.  Ensure **WebView2 Runtime** and **C++ Build Tools** are installed.
2.  Run the build script in Git Bash.
3.  Run the generated `.exe` installer.

---

## Contributing
Issues and Pull Requests are welcome!
1.  Fork the repo.
2.  Create a feature branch.
3.  Submit a PR.

---
Built with Care by Jordan Gonzales - © 2025 JTechMinds LLC. MIT License.
