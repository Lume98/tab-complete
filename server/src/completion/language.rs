use tower_lsp::lsp_types::Url;

pub fn detect_language(uri: &Url) -> String {
    let path = uri.path();
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    match ext {
        "rs" => "rust".to_string(),
        "ts" | "tsx" => "typescript".to_string(),
        "js" | "jsx" => "javascript".to_string(),
        "py" => "python".to_string(),
        "go" => "go".to_string(),
        "java" => "java".to_string(),
        "cpp" | "cc" | "cxx" => "cpp".to_string(),
        "c" => "c".to_string(),
        "h" | "hpp" => "c_header".to_string(),
        "cs" => "csharp".to_string(),
        "rb" => "ruby".to_string(),
        "php" => "php".to_string(),
        "swift" => "swift".to_string(),
        "kt" | "kts" => "kotlin".to_string(),
        "scala" => "scala".to_string(),
        "toml" => "toml".to_string(),
        "json" => "json".to_string(),
        "yaml" | "yml" => "yaml".to_string(),
        "md" => "markdown".to_string(),
        "html" => "html".to_string(),
        "css" => "css".to_string(),
        "sql" => "sql".to_string(),
        "sh" | "bash" => "bash".to_string(),
        "zsh" => "zsh".to_string(),
        "ps1" => "powershell".to_string(),
        "dart" => "dart".to_string(),
        _ => ext.to_string(),
    }
}
