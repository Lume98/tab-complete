/// API Key 安全管理
///
/// API Key 通过 VS Code SecretStorage 存储，通过 LSP initializationOptions 传入。
/// 不在日志中打印，不使用环境变量（除非用户自行设置）。

/// 从环境变量获取 API Key（作为 VS Code SecretStorage 的备选方案）
pub fn get_api_key_from_env(provider: &str) -> Option<String> {
    match provider {
        "claude" => std::env::var("ANTHROPIC_API_KEY").ok(),
        "openai" => std::env::var("OPENAI_API_KEY").ok(),
        _ => None,
    }
}

/// 屏蔽 API Key 中的敏感字符，用于日志
pub fn mask_api_key(key: &str) -> String {
    if key.len() <= 8 {
        return "****".to_string();
    }
    let prefix = &key[..4];
    let suffix = &key[key.len() - 4..];
    format!("{}...{}", prefix, suffix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_api_key() {
        let masked = mask_api_key("sk-ant-1234567890abcdef");
        assert_eq!(masked, "sk-a...cdef");
    }

    #[test]
    fn test_mask_short_key() {
        let masked = mask_api_key("abc");
        assert_eq!(masked, "****");
    }
}
