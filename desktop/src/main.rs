#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::net::TcpListener;
use std::path::PathBuf;
use tauri::async_runtime::Mutex;
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

struct BackendState {
    child: Mutex<Option<CommandChild>>,
    base_url: Mutex<Option<String>>,
}

#[derive(Serialize, Deserialize)]
struct WorkspaceConfig {
    path: String,
}

fn app_data_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("unable to resolve app data dir: {e}"))?;
    base.push("litefetch");
    fs::create_dir_all(&base).map_err(|e| format!("workspace init failed: {e}"))?;
    Ok(base)
}

fn default_workspace(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut base = app_data_root(app)?;
    base.push("workspace");
    fs::create_dir_all(&base).map_err(|e| format!("workspace init failed: {e}"))?;
    Ok(base)
}

fn workspace_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut root = app_data_root(app)?;
    root.push("workspace_path.json");
    Ok(root)
}

fn normalize_path(path: &str) -> PathBuf {
    if path == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    }
    if path.starts_with("~/") {
        if let Ok(home) = std::env::var("HOME") {
            let rest = path.trim_start_matches("~/");
            return PathBuf::from(home).join(rest);
        }
    }
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        candidate
    } else if let Ok(cwd) = std::env::current_dir() {
        cwd.join(candidate)
    } else {
        candidate
    }
}

fn load_workspace_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg_path = workspace_config_path(app)?;
    if cfg_path.exists() {
        let data =
            fs::read_to_string(&cfg_path).map_err(|e| format!("workspace read failed: {e}"))?;
        if let Ok(cfg) = serde_json::from_str::<WorkspaceConfig>(&data) {
            let path = normalize_path(&cfg.path);
            fs::create_dir_all(&path)
                .map_err(|e| format!("workspace init failed for stored path: {e}"))?;
            return Ok(path);
        }
    }
    default_workspace(app)
}

fn persist_workspace_path(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_path(path);
    fs::create_dir_all(&normalized)
        .map_err(|e| format!("workspace init failed for provided path: {e}"))?;
    let cfg_path = workspace_config_path(app)?;
    let payload = WorkspaceConfig {
        path: normalized.to_string_lossy().to_string(),
    };
    fs::write(
        &cfg_path,
        serde_json::to_string_pretty(&payload).map_err(|e| format!("workspace serialize failed: {e}"))?,
    )
    .map_err(|e| format!("workspace persist failed: {e}"))?;
    Ok(normalized)
}

fn reserve_port() -> Result<u16, String> {
    let socket = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("port bind failed: {e}"))?;
    let port = socket
        .local_addr()
        .map_err(|e| format!("port discovery failed: {e}"))?
        .port();
    drop(socket);
    Ok(port)
}

#[tauri::command]
async fn spawn_backend(app: &tauri::AppHandle, state: &State<'_, BackendState>) -> Result<String, String> {
    if let Some(url) = state.base_url.lock().await.clone() {
        return Ok(url);
    }

    let workspace = load_workspace_path(app)?;
    let port = reserve_port()?;

    let mut envs = HashMap::new();
    envs.insert("PORT".to_string(), port.to_string());
    envs.insert(
            "LITEFETCH_WORKSPACE".to_string(),
        workspace.to_string_lossy().to_string(),
    );

    let command = app
        .shell()
        .sidecar("litefetch-backend")
        .map_err(|e| format!("backend sidecar missing: {e}"))?
        .envs(envs)
        .args([
            "--host",
            "127.0.0.1",
            "--port",
            &port.to_string(),
            "--dir",
            workspace.to_string_lossy().as_ref(),
        ]);

    let (mut rx, child) = command.spawn().map_err(|e| format!("failed to start backend: {e}"))?;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => println!("[backend] {}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprintln!("[backend] {}", String::from_utf8_lossy(&line)),
                _ => {}
            }
        }
    });

    {
        let mut child_guard = state.child.lock().await;
        *child_guard = Some(child);
    }

    let base_url = format!("http://127.0.0.1:{}/api", port);
    {
        let mut url_guard = state.base_url.lock().await;
        *url_guard = Some(base_url.clone());
    }

    Ok(base_url)
}

#[tauri::command]
async fn start_backend(app: tauri::AppHandle, state: State<'_, BackendState>) -> Result<String, String> {
    spawn_backend(&app, &state).await
}

#[tauri::command]
async fn set_workspace_path(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let persisted = persist_workspace_path(&app, path.trim())
        .map_err(|e| format!("failed to persist workspace: {e}"))?;
    Ok(persisted.to_string_lossy().to_string())
}

#[tauri::command]
async fn switch_workspace(app: tauri::AppHandle, state: State<'_, BackendState>, path: String) -> Result<String, String> {
    let persisted = persist_workspace_path(&app, path.trim())
        .map_err(|e| format!("failed to persist workspace: {e}"))?;

    // Stop existing backend, clear cached URL, and respawn with the new workspace.
    shutdown_backend_async(&state).await;
    {
        let mut url_guard = state.base_url.lock().await;
        *url_guard = None;
    }
    // Spawn backend with the new workspace; ignore base URL return here since the frontend will re-resolve.
    let _ = spawn_backend(&app, &state).await?;
    println!("[workspace] switched to {}", persisted.to_string_lossy());
    Ok(persisted.to_string_lossy().to_string())
}

fn shutdown_backend(state: &State<BackendState>) {
    let mut guard = state.child.blocking_lock();
    if let Some(child) = guard.take() {
        let _ = child.kill();
    }
}

async fn shutdown_backend_async(state: &State<'_, BackendState>) {
    let mut guard = state.child.lock().await;
    if let Some(child) = guard.take() {
        let _ = child.kill();
    }
}

fn main() {
    // Favor software rendering to avoid EGL/DRI issues on systems without GPU/DRM setup.
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");

    tauri::Builder::default()
        .manage(BackendState {
            child: Mutex::new(None),
            base_url: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_backend, set_workspace_path, switch_workspace])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                shutdown_backend(&window.state::<BackendState>());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running LiteFetch desktop");
}
