use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::Serialize;
use std::{fs, path::PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{
  menu::{
    AboutMetadataBuilder, CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder,
    SubmenuBuilder,
  },
  AppHandle, Emitter, Manager, Wry,
};
use tauri_plugin_dialog::DialogExt;
use tauri_utils::TitleBarStyle;

static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

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
fn open_file(app: AppHandle) -> Result<Option<FilePayload>, String> {
  let Some(path) = app.dialog().file().add_filter("Markdown", &["md", "markdown"]).blocking_pick_file().and_then(to_path) else {
    return Ok(None);
  };
  Ok(Some(read_payload(path)?))
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
fn save_file_as(app: AppHandle, content: String) -> Result<Option<FilePayload>, String> {
  let Some(path) = app.dialog().file().add_filter("Markdown", &["md", "markdown"]).set_file_name("untitled.md").blocking_save_file().and_then(to_path) else {
    return Ok(None);
  };
  fs::write(&path, content).map_err(|err| err.to_string())?;
  Ok(Some(read_payload(path)?))
}

#[tauri::command]
fn set_full_path_menu_checked(app: AppHandle, checked: bool) -> Result<(), String> {
  let item = app.state::<CheckMenuItem<Wry>>();
  item.set_checked(checked).map_err(|e| e.to_string())
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

fn to_path(file: tauri_plugin_dialog::FilePath) -> Option<PathBuf> {
  match file {
    tauri_plugin_dialog::FilePath::Path(path) => Some(path),
    _ => None,
  }
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

fn about_metadata() -> tauri::menu::AboutMetadata<'static> {
  AboutMetadataBuilder::new()
    .name(Some("Paperboy"))
    .version(Some(env!("CARGO_PKG_VERSION")))
    .comments(Some("Minimal markdown editor with a newspaper-styled preview."))
    .build()
}

fn menu(app: &AppHandle, full_path_item: &CheckMenuItem<Wry>) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
  let about = about_metadata();
  #[cfg(target_os = "macos")]
  let app_menu = SubmenuBuilder::new(app, "Paperboy")
    .about(Some(about.clone()))
    .separator()
    .services()
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;
  let file = SubmenuBuilder::new(app, "File")
    .item(&MenuItemBuilder::with_id("new", "New Tab").accelerator("CmdOrCtrl+N").build(app)?)
    .item(&MenuItemBuilder::with_id("new_window", "New Window").accelerator("CmdOrCtrl+Shift+N").build(app)?)
    .separator()
    .item(&MenuItemBuilder::with_id("open", "Open…").accelerator("CmdOrCtrl+O").build(app)?)
    .item(&MenuItemBuilder::with_id("open_tab", "Open in New Tab…").build(app)?)
    .item(&MenuItemBuilder::with_id("open_window", "Open in New Window…").build(app)?)
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
  let help = SubmenuBuilder::new(app, "Help").about(Some(about)).build()?;
  #[cfg(target_os = "macos")]
  let items: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 4] = [&app_menu, &file, &edit, &view];
  #[cfg(not(target_os = "macos"))]
  let items: [&dyn tauri::menu::IsMenuItem<tauri::Wry>; 4] = [&file, &edit, &view, &help];
  MenuBuilder::new(app).items(&items).build()
}

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      open_file,
      read_file,
      read_file_bytes,
      save_file,
      save_file_as,
      create_window,
      set_full_path_menu_checked
    ])
    .setup(|app| {
      let full_path_item =
        CheckMenuItemBuilder::with_id("view_full_path", "Show Full Path in Footer").checked(false).build(app.handle())?;
      app.manage(full_path_item.clone());
      app.set_menu(menu(app.handle(), &full_path_item)?)?;
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
      _ => {}
    })
    .run(tauri::generate_context!())
    .expect("error while running Paperboy");
}
