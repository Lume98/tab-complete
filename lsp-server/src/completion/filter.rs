/// 补全结果后处理

/// 过滤和格式化补全文本
pub fn filter_completion(text: &str, prefix: &str) -> Option<String> {
    let text = text.trim();

    // 空结果
    if text.is_empty() {
        return None;
    }

    // 如果补全内容和前缀相同（无实际补全）
    if text == prefix.trim() {
        return None;
    }

    // 去除可能的 markdown 代码块包装
    let text = strip_code_fence(text, &detect_language_from_prefix(prefix));

    // 如果补全以 prefix 开头，去掉 prefix 部分
    let result = if text.starts_with(prefix.trim()) {
        text[prefix.trim().len()..].trim().to_string()
    } else {
        text.to_string()
    };

    if result.is_empty() {
        return None;
    }

    Some(result)
}

/// 去除代码块标记
fn strip_code_fence<'a>(text: &'a str, _language: &str) -> &'a str {
    let text = text.trim();
    if let Some(rest) = text.strip_prefix("```") {
        // 跳过语言标识行
        if let Some(code_start) = rest.find('\n') {
            let code = &rest[code_start + 1..];
            if let Some(end) = code.rfind("```") {
                return code[..end].trim();
            }
            return code.trim();
        }
    }
    text
}

fn detect_language_from_prefix(prefix: &str) -> &str {
    // 简单启发式检测
    if prefix.contains("fn ") || prefix.contains("let ") || prefix.contains("impl ") {
        "rust"
    } else if prefix.contains("def ") || prefix.contains("import ") || prefix.contains("class ") {
        "python"
    } else if prefix.contains("function ") || prefix.contains("const ") || prefix.contains("let ") {
        "typescript"
    } else {
        ""
    }
}

/// 截断补全到合理长度
pub fn truncate_completion(text: &str, max_lines: usize, max_chars: usize) -> String {
    if text.len() <= max_chars {
        return text.to_string();
    }

    let mut result = String::new();
    let mut line_count = 0;

    for line in text.lines() {
        if line_count >= max_lines {
            result.push('\n');
            break;
        }
        if result.len() + line.len() + 1 > max_chars {
            break;
        }
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(line);
        line_count += 1;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_empty() {
        assert_eq!(filter_completion("", "let x = "), None);
        assert_eq!(filter_completion("  ", "let x = "), None);
    }

    #[test]
    fn test_filter_same_as_prefix() {
        assert_eq!(filter_completion("let x = ", "let x = "), None);
    }

    #[test]
    fn test_filter_normal() {
        let result = filter_completion("42", "let x = ");
        assert_eq!(result, Some("42".to_string()));
    }

    #[test]
    fn test_filter_code_fence() {
        let result = filter_completion("```rust\n42\n```", "let x = ");
        assert_eq!(result, Some("42".to_string()));
    }

    #[test]
    fn test_truncate() {
        let text = "line1\nline2\nline3\nline4";
        assert_eq!(truncate_completion(text, 2, 100), "line1\nline2");
    }
}
