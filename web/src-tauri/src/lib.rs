#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Lets the web UI open external links (Discord, Instagram, APK page)
        // in the user's default browser instead of inside the app webview.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Sacred Esports desktop app");
}
