pub mod env;

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// AI Provider 类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AIProviderType {
    Claude,
    OpenAI,
    Ollama,
}

impl Default for AIProviderType {
    fn default() -> Self {
        Self::Claude
    }
}

impl std::fmt::Display for AIProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIProviderType::Claude => write!(f, "claude"),
            AIProviderType::OpenAI => write!(f, "openai"),
            AIProviderType::Ollama => write!(f, "ollama"),
        }
    }
}

impl AIProviderType {
    pub fn parse(value: &str) -> Option<Self> {
        match value.to_lowercase().as_str() {
            "claude" => Some(Self::Claude),
            "openai" => Some(Self::OpenAI),
            "ollama" => Some(Self::Ollama),
            _ => None,
        }
    }
}

/// 全局配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    // AI Provider
    pub provider: AIProviderType,

    // API Keys（配置文件中可直接设置，优先级高于环境变量）
    pub claude_api_key: Option<String>,
    pub openai_api_key: Option<String>,

    // Claude 配置
    pub claude_model: String,
    pub claude_api_base: String,

    // OpenAI 配置
    pub openai_model: String,
    pub openai_api_base: String,

    // Ollama 配置
    pub ollama_model: String,
    pub ollama_api_base: String,

    // 补全参数
    pub max_tokens: u32,
    pub debounce_ms: u64,
    pub context_lines_before: usize,
    pub context_lines_after: usize,
    pub enable_auto_completion: bool,
    pub enable_streaming: bool,

    // 缓存
    pub cache_max_entries: usize,
    pub cache_ttl_secs: u64,

    // 代理
    pub proxy_url: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            provider: AIProviderType::Claude,
            claude_api_key: None,
            openai_api_key: None,
            claude_model: "claude-sonnet-4-20250514".to_string(),
            claude_api_base: "https://api.anthropic.com".to_string(),
            openai_model: "gpt-4o".to_string(),
            openai_api_base: "https://api.openai.com".to_string(),
            ollama_model: "codellama".to_string(),
            ollama_api_base: "http://localhost:11434".to_string(),
            max_tokens: 256,
            debounce_ms: 150,
            context_lines_before: 50,
            context_lines_after: 20,
            enable_auto_completion: true,
            enable_streaming: true,
            cache_max_entries: 1000,
            cache_ttl_secs: 30,
            proxy_url: None,
        }
    }
}

impl AppConfig {
    /// 加载配置，优先级：配置文件 > 环境变量 > 默认值
    pub fn load() -> Self {
        let mut config = Self::default();

        // 尝试从配置文件加载
        if let Some(file_config) = Self::load_from_file() {
            config.merge(file_config);
            tracing::info!("Loaded config from file");
        } else {
            tracing::info!("No config file found, using defaults + env vars");
        }

        // 环境变量作为补充（仅当配置文件未设置时）
        config.fill_from_env();

        config
    }

    pub fn normalize_provider(&mut self) {
        if let Some(provider) = AIProviderType::parse(&self.provider.to_string()) {
            self.provider = provider;
        } else {
            tracing::warn!("Invalid provider in config, fallback to default: {}", self.provider);
            self.provider = AIProviderType::default();
        }
    }

    /// 获取 Claude API Key，优先级：配置文件 > 环境变量
    pub fn resolve_claude_api_key(&self) -> Option<String> {
        self.claude_api_key
            .clone()
            .or_else(|| env::get_api_key_from_env("claude"))
    }

    /// 获取 OpenAI API Key，优先级：配置文件 > 环境变量
    pub fn resolve_openai_api_key(&self) -> Option<String> {
        self.openai_api_key
            .clone()
            .or_else(|| env::get_api_key_from_env("openai"))
    }

    /// 从文件加载配置
    /// 查找顺序：
    /// 1. 当前工作目录 .ai-tab-complete.toml
    /// 2. 用户 home 目录 .ai-tab-complete.toml
    fn load_from_file() -> Option<Self> {
        let candidates = Self::config_file_paths();
        for path in candidates {
            if path.exists() {
                tracing::info!("Found config file: {}", path.display());
                match std::fs::read_to_string(&path) {
                    Ok(content) => {
                        match toml::from_str::<AppConfig>(&content) {
                            Ok(config) => {
                                tracing::info!(
                                    "Config: provider={}, claude_key={}, openai_key={}",
                                    config.provider,
                                    config.claude_api_key.as_ref().map(|k| env::mask_api_key(k)).unwrap_or("none".to_string()),
                                    config.openai_api_key.as_ref().map(|k| env::mask_api_key(k)).unwrap_or("none".to_string()),
                                );
                                return Some(config);
                            }
                            Err(e) => {
                                tracing::warn!("Failed to parse config file {}: {}", path.display(), e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to read config file {}: {}", path.display(), e);
                    }
                }
            }
        }
        None
    }

    /// 配置文件候选路径
    fn config_file_paths() -> Vec<PathBuf> {
        let mut paths = Vec::new();

        // 1. 当前工作目录
        if let Ok(cwd) = std::env::current_dir() {
            paths.push(cwd.join(".ai-tab-complete.toml"));
        }

        // 2. 用户 home 目录
        if let Some(home) = dirs_home() {
            paths.push(home.join(".ai-tab-complete.toml"));
        }

        // 3. XDG config 目录 (Linux/macOS)
        if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
            paths.push(PathBuf::from(xdg).join("ai-tab-complete").join("config.toml"));
        } else if let Some(home) = dirs_home() {
            paths.push(home.join(".config").join("ai-tab-complete").join("config.toml"));
        }

        paths
    }

    /// 用文件配置覆盖默认值（只覆盖非默认字段）
    fn merge(&mut self, file_config: AppConfig) {
        // 直接用文件配置覆盖，因为 toml 解析时未设置的字段会用 Default 填充
        // 但我们要保留默认值，所以只覆盖非空/非默认的字段
        // 简单做法：直接用文件配置
        *self = file_config;
    }

    /// 用环境变量补充缺失的配置
    fn fill_from_env(&mut self) {
        // 环境变量覆盖非 API key 配置
        if let Ok(v) = std::env::var("AI_TAB_COMPLETE_PROVIDER") {
            if let Some(provider) = AIProviderType::parse(&v) {
                self.provider = provider;
            } else {
                tracing::warn!("Ignoring invalid provider from env: {}", v);
            }
        }
        if let Ok(v) = std::env::var("AI_TAB_COMPLETE_MAX_TOKENS") {
            if let Ok(n) = v.parse() { self.max_tokens = n; }
        }
        if let Ok(v) = std::env::var("AI_TAB_COMPLETE_DEBOUNCE_MS") {
            if let Ok(n) = v.parse() { self.debounce_ms = n; }
        }
        if let Ok(v) = std::env::var("AI_TAB_COMPLETE_STREAMING") {
            self.enable_streaming = v != "false" && v != "0";
        }

        self.normalize_provider();
    }
}

/// 获取用户 home 目录（不引入 dirs crate）
fn dirs_home() -> Option<PathBuf> {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn provider_parse_supports_known_values() {
        assert_eq!(AIProviderType::parse("claude"), Some(AIProviderType::Claude));
        assert_eq!(AIProviderType::parse("openai"), Some(AIProviderType::OpenAI));
        assert_eq!(AIProviderType::parse("ollama"), Some(AIProviderType::Ollama));
        assert_eq!(AIProviderType::parse("OpenAI"), Some(AIProviderType::OpenAI));
    }

    #[test]
    fn provider_parse_rejects_unknown_values() {
        assert_eq!(AIProviderType::parse(""), None);
        assert_eq!(AIProviderType::parse("azure"), None);
    }

    #[test]
    fn fill_from_env_ignores_invalid_provider() {
        let _guard = env_lock();
        let original = std::env::var("AI_TAB_COMPLETE_PROVIDER").ok();
        // SAFETY: tests mutate process env and restore it before exit.
        unsafe { std::env::set_var("AI_TAB_COMPLETE_PROVIDER", "invalid-provider") };

        let mut cfg = AppConfig::default();
        cfg.provider = AIProviderType::OpenAI;
        cfg.fill_from_env();
        assert_eq!(cfg.provider, AIProviderType::OpenAI);

        match original {
            Some(v) => {
                // SAFETY: restore pre-test env value.
                unsafe { std::env::set_var("AI_TAB_COMPLETE_PROVIDER", v) };
            }
            None => {
                // SAFETY: restore pre-test absence.
                unsafe { std::env::remove_var("AI_TAB_COMPLETE_PROVIDER") };
            }
        }
    }

    #[test]
    fn load_uses_default_values_without_config_or_env() {
        let _guard = env_lock();
        let provider = std::env::var("AI_TAB_COMPLETE_PROVIDER").ok();
        let max_tokens = std::env::var("AI_TAB_COMPLETE_MAX_TOKENS").ok();
        let debounce_ms = std::env::var("AI_TAB_COMPLETE_DEBOUNCE_MS").ok();
        let streaming = std::env::var("AI_TAB_COMPLETE_STREAMING").ok();
        let cwd = std::env::current_dir().unwrap();
        let temp_dir = std::env::temp_dir().join(format!(
            "ai-tab-complete-config-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // SAFETY: restore below.
        unsafe {
            std::env::remove_var("AI_TAB_COMPLETE_PROVIDER");
            std::env::remove_var("AI_TAB_COMPLETE_MAX_TOKENS");
            std::env::remove_var("AI_TAB_COMPLETE_DEBOUNCE_MS");
            std::env::remove_var("AI_TAB_COMPLETE_STREAMING");
            std::env::remove_var("HOME");
            std::env::remove_var("USERPROFILE");
            std::env::remove_var("XDG_CONFIG_HOME");
        }
        std::env::set_current_dir(&temp_dir).unwrap();

        let cfg = AppConfig::load();
        assert_eq!(cfg.provider, AIProviderType::Claude);
        assert_eq!(cfg.max_tokens, 256);
        assert_eq!(cfg.debounce_ms, 150);
        assert!(cfg.enable_streaming);

        std::env::set_current_dir(cwd).unwrap();
        match provider {
            Some(v) => unsafe { std::env::set_var("AI_TAB_COMPLETE_PROVIDER", v) },
            None => unsafe { std::env::remove_var("AI_TAB_COMPLETE_PROVIDER") },
        }
        match max_tokens {
            Some(v) => unsafe { std::env::set_var("AI_TAB_COMPLETE_MAX_TOKENS", v) },
            None => unsafe { std::env::remove_var("AI_TAB_COMPLETE_MAX_TOKENS") },
        }
        match debounce_ms {
            Some(v) => unsafe { std::env::set_var("AI_TAB_COMPLETE_DEBOUNCE_MS", v) },
            None => unsafe { std::env::remove_var("AI_TAB_COMPLETE_DEBOUNCE_MS") },
        }
        match streaming {
            Some(v) => unsafe { std::env::set_var("AI_TAB_COMPLETE_STREAMING", v) },
            None => unsafe { std::env::remove_var("AI_TAB_COMPLETE_STREAMING") },
        }

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn normalize_provider_keeps_valid_values() {
        let mut cfg = AppConfig::default();
        cfg.provider = AIProviderType::OpenAI;
        cfg.normalize_provider();
        assert_eq!(cfg.provider, AIProviderType::OpenAI);
    }
}
