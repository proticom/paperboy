use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use keyring::Entry;
use serde::Serialize;
use serde_json::{json, Value as JsonValue};
use std::{fs, path::PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

// Same service name the CLI writes under, so keys set in either place are
// visible in both. Account names match the CLI's per-provider env var names:
//   PAPERBOY_OPENROUTER_API_KEY, PAPERBOY_OPENAI_API_KEY, etc.
const KEYRING_SERVICE: &str = "paperboy-cli";
const RECENT_STORE_PATH: &str = "recent-files.json";
const RECENT_FILES_KEY: &str = "recentFiles";
const MAX_RECENT_FILES: usize = 10;

// Providers that take an API key. Kept in sync with paperboy-cli/src/providers.ts
// (openrouter, openai, anthropic, xai). Ollama and local-endpoint don't need
// a key. "disabled" isn't a real provider here.
fn provider_env_var(provider: &str) -> Option<&'static str> {
  match provider {
    "openrouter" => Some("PAPERBOY_OPENROUTER_API_KEY"),
    "openai" => Some("PAPERBOY_OPENAI_API_KEY"),
    "anthropic" => Some("PAPERBOY_ANTHROPIC_API_KEY"),
    "xai" => Some("PAPERBOY_XAI_API_KEY"),
    _ => None,
  }
}

fn provider_entry(provider: &str) -> Result<Entry, String> {
  let envvar = provider_env_var(provider)
    .ok_or_else(|| format!("Unknown provider: {provider}"))?;
  Entry::new(KEYRING_SERVICE, envvar).map_err(|err| err.to_string())
}
use tauri_plugin_store::StoreExt;
use tauri_plugin_window_state::StateFlags;
use tauri::{
  menu::{
    AboutMetadataBuilder, CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder,
    SubmenuBuilder,
  },
  AppHandle, Emitter, Manager, Wry,
};
use tauri_utils::TitleBarStyle;

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

/// Buffers file paths handed to us by macOS `RunEvent::Opened` (Finder
/// double-click, "Open With", drag-onto-Dock). On a cold launch that event
/// fires before the webview's JS listeners exist, so a fire-and-forget emit is
/// lost and the window comes up blank. We stash paths here instead; the
/// frontend drains them once it's ready (and again on each `pending-open`
/// ping, which covers the already-running "warm" case).
#[derive(Default)]
struct PendingOpen(Mutex<Vec<String>>);

#[derive(Serialize)]
struct FilePayload {
  path: String,
  content: String,
}

#[derive(Serialize)]
struct BinaryFilePayload {
  path: String,
  base64: String,
}

#[tauri::command]
fn read_file(path: String) -> Result<FilePayload, String> {
  read_payload(PathBuf::from(path))
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<BinaryFilePayload, String> {
  let bytes = fs::read(&path).map_err(|err| err.to_string())?;
  Ok(BinaryFilePayload {
    path,
    base64: BASE64_STANDARD.encode(bytes),
  })
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
  fs::write(path, content).map_err(|err| err.to_string())
}

#[tauri::command]
fn set_full_path_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
  let item = app.state::<CheckMenuItem<Wry>>();
  item.set_checked(checked).map_err(|e| e.to_string())
}

// --- AI key management -------------------------------------------------
//
// The JS settings panel calls these to read, write, and remove API keys
// in the OS-native credential store. Backed by the `keyring` crate, which
// targets macOS Keychain, Windows Credential Manager, and Linux Secret
// Service. Keys are shared with paperboy-cli (same service name and
// per-provider account names).

#[tauri::command]
fn get_api_key(provider: String) -> Result<Option<String>, String> {
  let entry = provider_entry(&provider)?;
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(err) => Err(err.to_string()),
  }
}

#[tauri::command]
fn set_api_key(provider: String, key: String) -> Result<(), String> {
  let entry = provider_entry(&provider)?;
  entry.set_password(&key).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_api_key(provider: String) -> Result<(), String> {
  let entry = provider_entry(&provider)?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(err) => Err(err.to_string()),
  }
}

#[tauri::command]
fn list_configured_providers() -> Vec<String> {
  let mut configured = Vec::new();
  for provider in ["openrouter", "openai", "anthropic", "xai"] {
    if let Ok(entry) = provider_entry(provider) {
      if entry.get_password().is_ok() {
        configured.push(provider.to_string());
      }
    }
  }
  configured
}

#[tauri::command]
fn create_window(app: AppHandle, file_path: Option<String>) -> Result<(), String> {
  let id = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
  let label = format!("window-{}", id);

  let url = match &file_path {
    Some(path) => format!("index.html?file={}", BASE64_STANDARD.encode(path)),
    None => "index.html".to_string(),
  };

  let builder = tauri::WebviewWindowBuilder::new(
    &app,
    &label,
    tauri::WebviewUrl::App(url.into()),
  )
  .title("Paperboy")
  .inner_size(1200.0, 800.0)
  .min_inner_size(600.0, 400.0)
  .title_bar_style(TitleBarStyle::Overlay)
  .hidden_title(true);

  #[cfg(target_os = "macos")]
  let builder = builder.traffic_light_position(tauri::LogicalPosition::new(12.0, 17.0));

  builder.build().map_err(|e| e.to_string())?;
  Ok(())
}

fn read_payload(path: PathBuf) -> Result<FilePayload, String> {
  Ok(FilePayload {
    content: fs::read_to_string(&path).map_err(|err| err.to_string())?,
    path: path.to_string_lossy().into_owned(),
  })
}

fn emit(app: &AppHandle, event: &str) {
  for (_, window) in app.webview_windows() {
    if window.is_focused().unwrap_or(false) {
      let _ = window.emit(event, ());
      return;
    }
  }
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.emit(event, ());
  }
}

fn emit_with_payload<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
  for (_, window) in app.webview_windows() {
    if window.is_focused().unwrap_or(false) {
      let _ = window.emit(event, payload.clone());
      return;
    }
  }
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.emit(event, payload);
  }
}

fn load_recent_files(app: &AppHandle) -> Result<Vec<String>, String> {
  let store = app.store(RECENT_STORE_PATH).map_err(|err| err.to_string())?;
  match store.get(RECENT_FILES_KEY) {
    Some(JsonValue::Array(items)) => Ok(items
      .iter()
      .filter_map(|value| value.as_str().map(str::to_string))
      .collect()),
    _ => Ok(Vec::new()),
  }
}

fn save_recent_files(app: &AppHandle, files: &[String]) -> Result<(), String> {
  let store = app.store(RECENT_STORE_PATH).map_err(|err| err.to_string())?;
  store.set(RECENT_FILES_KEY, json!(files));
  Ok(())
}

fn clear_recent_files(app: &AppHandle) -> Result<(), String> {
  save_recent_files(app, &[])
}

fn rebuild_menu(app: &AppHandle) -> Result<(), String> {
  let full_path_item = app.state::<CheckMenuItem<Wry>>();
  let recent = load_recent_files(app)?;
  let next_menu = menu(app, &full_path_item, &recent).map_err(|err| err.to_string())?;
  app.set_menu(next_menu).map_err(|err| err.to_string())?;
  Ok(())
}

#[tauri::command]
fn push_recent_file(app: AppHandle, path: String) -> Result<(), String> {
  let mut files = load_recent_files(&app)?;
  files.retain(|existing| existing != &path);
  files.insert(0, path);
  files.truncate(MAX_RECENT_FILES);
  save_recent_files(&app, &files)?;
  rebuild_menu(&app)
}

/// Atomically drain the file paths buffered by `RunEvent::Opened`. Safe to
/// call from more than one trigger (the frontend's startup one-shot and each
/// `pending-open` ping) — the mutex guarantees every path is handed to exactly
/// one caller, so files never load twice.
#[tauri::command]
fn take_pending_open_paths(state: tauri::State<PendingOpen>) -> Vec<String> {
  state
    .0
    .lock()
    .map(|mut queue| std::mem::take(&mut *queue))
    .unwrap_or_default()
}

fn about_metadata() -> tauri::menu::AboutMetadata<'static> {
  AboutMetadataBuilder::new()
    .name(Some("Paperboy"))
    .version(Some(env!("CARGO_PKG_VERSION")))
    .comments(Some("Minimal markdown editor with a newspaper-styled preview."))
    .build()
}

fn build_open_recent_submenu(
  app: &AppHandle,
  recent: &[String],
) -> tauri::Result<tauri::menu::Submenu<Wry>> {
  let mut builder = SubmenuBuilder::new(app, "Open Recent");
  if recent.is_empty() {
    builder = builder.item(
      &MenuItemBuilder::with_id("recent_empty", "(No Recent Files)")
        .enabled(false)
        .build(app)?,
    );
  } else {
    for (index, path) in recent.iter().enumerate() {
      let label = PathBuf::from(path)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.clone());
      let id = format!("recent::{index}");
      builder = builder.item(&MenuItemBuilder::with_id(&id, &label).build(app)?);
    }
  }
  builder
    .separator()
    .item(&MenuItemBuilder::with_id("recent_clear", "Clear Recent").build(app)?)
    .build()
}

fn menu(
  app: &AppHandle,
  full_path_item: &CheckMenuItem<Wry>,
  recent: &[String],
) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
  let about = about_metadata();
  #[cfg(target_os = "macos")]
  let app_menu = SubmenuBuilder::new(app, "Paperboy")
    .about(Some(about.clone()))
    .separator()
    .item(&MenuItemBuilder::with_id("settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?)
    .separator()
    .services()
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;
  let open_recent = build_open_recent_submenu(app, recent)?;
  let file = SubmenuBuilder::new(app, "File")
    .item(&MenuItemBuilder::with_id("new", "New Tab").accelerator("CmdOrCtrl+N").build(app)?)
    .item(&MenuItemBuilder::with_id("new_window", "New Window").accelerator("CmdOrCtrl+Shift+N").build(app)?)
    .separator()
    .item(&MenuItemBuilder::with_id("open", "Open…").accelerator("CmdOrCtrl+O").build(app)?)
    .item(&MenuItemBuilder::with_id("open_tab", "Open in New Tab…").build(app)?)
    .item(&MenuItemBuilder::with_id("open_window", "Open in New Window…").build(app)?)
    .item(&open_recent)
    .separator()
    .item(&MenuItemBuilder::with_id("save", "Save").accelerator("CmdOrCtrl+S").build(app)?)
    .item(&MenuItemBuilder::with_id("save_as", "Save As…").accelerator("CmdOrCtrl+Shift+S").build(app)?)
    .separator()
    .item(&MenuItemBuilder::with_id("close", "Close Tab").accelerator("CmdOrCtrl+W").build(app)?)
    .build()?;
  let view = SubmenuBuilder::new(app, "View")
    .item(&MenuItemBuilder::with_id("view_preview", "Preview").build(app)?)
    .item(&MenuItemBuilder::with_id("view_editor", "Editor").build(app)?)
    .item(&MenuItemBuilder::with_id("view_split", "Split").build(app)?)
    .separator()
    .item(full_path_item)
    .build()?;
  let edit = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;
  #[cfg(not(target_os = "macos"))]
  let help = SubmenuBuilder::new(app, "Help")
    .item(&MenuItemBuilder::with_id("settings", "Settings…").accelerator("CmdOrCtrl+,").build(app)?)
    .separator()
    .about(Some(about))
    .build()?;
  #[cfg(target_os = "macos")]
  let items: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 4] = [&app_menu, &file, &edit, &view];
  #[cfg(not(target_os = "macos"))]
  let items: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 4] = [&file, &edit, &view, &help];
  MenuBuilder::new(app).items(&items).build()
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
        .build(),
    )
    .plugin(tauri_plugin_store::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      read_file,
      read_file_bytes,
      save_file,
      create_window,
      set_full_path_menu_checked,
      get_api_key,
      set_api_key,
      delete_api_key,
      list_configured_providers,
      take_pending_open_paths,
      push_recent_file
    ])
    .setup(|app| {
      app.manage(PendingOpen::default());
      let full_path_item =
        CheckMenuItemBuilder::with_id("view_full_path", "Show Full Path in Footer").checked(false).build(app.handle())?;
      app.manage(full_path_item.clone());
      let recent = load_recent_files(app.handle()).unwrap_or_default();
      app.set_menu(menu(app.handle(), &full_path_item, &recent)?)?;
      Ok(())
    })
    .on_menu_event(|app, event| match event.id().as_ref() {
      "new" => emit(app, "menu-new"),
      "new_window" => emit(app, "menu-new-window"),
      "open" => emit(app, "menu-open"),
      "open_tab" => emit(app, "menu-open-tab"),
      "open_window" => emit(app, "menu-open-window"),
      "save" => emit(app, "menu-save"),
      "save_as" => emit(app, "menu-save-as"),
      "close" => emit(app, "menu-close"),
      "view_preview" => emit(app, "menu-view-preview"),
      "view_editor" => emit(app, "menu-view-editor"),
      "view_split" => emit(app, "menu-view-split"),
      "view_full_path" => emit(app, "menu-view-full-path"),
      "settings" => emit(app, "menu-settings"),
      "recent_clear" => {
        if clear_recent_files(app).is_ok() {
          let _ = rebuild_menu(app);
        }
      }
      id if id.starts_with("recent::") => {
        if let Some(index_str) = id.strip_prefix("recent::") {
          if let Ok(index) = index_str.parse::<usize>() {
            if let Ok(files) = load_recent_files(app) {
              if let Some(path) = files.get(index) {
                emit_with_payload(app, "menu-open-recent", path.clone());
              }
            }
          }
        }
      }
      _ => {}
    })
    .build(tauri::generate_context!())
    .expect("error while building Paperboy")
    .run(|app_handle, event| {
      // macOS "Open With → Paperboy" (Finder double-click, drag-onto-Dock,
      // lsopen). RunEvent::Opened can fire before the webview's JS listeners
      // exist (cold launch), so we never rely on a fire-and-forget emit:
      // buffer the paths and let the frontend drain them when it's ready. The
      // `pending-open` ping is a best-effort nudge for the already-running case.
      if let tauri::RunEvent::Opened { urls } = event {
        if let Some(state) = app_handle.try_state::<PendingOpen>() {
          if let Ok(mut queue) = state.0.lock() {
            for url in &urls {
              if let Ok(path) = url.to_file_path() {
                if let Some(path_str) = path.to_str() {
                  queue.push(path_str.to_string());
                }
              }
            }
          }
        }
        emit(app_handle, "pending-open");
      }
    });
}
