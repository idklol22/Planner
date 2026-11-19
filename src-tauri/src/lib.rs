use std::fs;
use std::path::PathBuf;

use tauri::Manager;

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("todomate.json"))
}

/// Read the whole local store. `None` means "first run".
#[tauri::command]
fn read_store(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = store_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

/// Atomically replace the store (write temp, then rename).
#[tauri::command]
fn write_store(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    let path = store_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Write a finished note as Markdown into the LearnHarness handoff folder.
/// An explicit absolute `folder` wins; otherwise the app's data/handoff dir.
#[tauri::command]
fn write_handoff_file(
    app: tauri::AppHandle,
    folder: Option<String>,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    let safe_name: String = file_name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '\0' => '_',
            _ => c,
        })
        .collect();
    if safe_name.trim().is_empty() {
        return Err("empty handoff file name".into());
    }

    let dir = match folder {
        Some(f) if !f.trim().is_empty() => PathBuf::from(f),
        _ => app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("handoff"),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe_name);
    fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_store,
            write_store,
            write_handoff_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running ToDoMate");
}
