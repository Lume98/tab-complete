use serde::{Deserialize, Serialize};

/// AI 补全请求 - 包含所有需要的上下文信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionRequest {
    /// 文件路径
    pub file_path: String,
    /// 光标前文本（当前行光标前）
    pub prefix: String,
    /// 光标后文本（当前行光标后）
    pub suffix: String,
    /// 语言标识
    pub language: String,
    /// 光标前 N 行
    pub context_before: Vec<String>,
    /// 光标后 N 行
    pub context_after: Vec<String>,
    /// 语法上下文
    pub syntax_context: Option<SyntaxContext>,
}

/// 语法上下文信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyntaxContext {
    pub current_function: Option<String>,
    pub current_class: Option<String>,
    pub scope_variables: Vec<String>,
    pub imports: Vec<String>,
}

/// 上下文收集器
pub struct ContextCollector {
    pub max_lines_before: usize,
    pub max_lines_after: usize,
}

impl Default for ContextCollector {
    fn default() -> Self {
        Self {
            max_lines_before: 50,
            max_lines_after: 20,
        }
    }
}

impl ContextCollector {
    pub fn new(max_lines_before: usize, max_lines_after: usize) -> Self {
        Self {
            max_lines_before,
            max_lines_after,
        }
    }

    /// 收集上下文
    pub fn collect(
        &self,
        content: &str,
        line: usize,
        character: usize,
        file_path: &str,
        language: &str,
    ) -> CompletionRequest {
        let lines: Vec<&str> = content.lines().collect();
        let current_line = lines.get(line).unwrap_or(&"");

        // 光标前文本
        let prefix = current_line[..std::cmp::min(character, current_line.len())].to_string();
        // 光标后文本
        let suffix = if character < current_line.len() {
            current_line[character..].to_string()
        } else {
            String::new()
        };

        // 上下文行
        let ctx_before: Vec<String> = if line > 0 {
            let start = line.saturating_sub(self.max_lines_before);
            lines[start..line].iter().map(|s| s.to_string()).collect()
        } else {
            vec![]
        };

        let ctx_after: Vec<String> = {
            let end = std::cmp::min(line + 1 + self.max_lines_after, lines.len());
            lines[line..end].iter().map(|s| s.to_string()).collect()
        };

        CompletionRequest {
            file_path: file_path.to_string(),
            prefix,
            suffix,
            language: language.to_string(),
            context_before: ctx_before,
            context_after: ctx_after,
            syntax_context: None,
        }
    }
}

/// 检查是否应该触发补全
pub fn should_complete(prefix: &str, language: &str) -> bool {
    let prefix = prefix.trim();

    if prefix.is_empty() {
        return false;
    }

    // 避免在注释中补全（简单启发式）
    let comment_prefixes = match language {
        "rust" | "go" | "java" | "c" | "cpp" | "csharp" | "kotlin" | "swift" | "dart" => {
            vec!["//", "/*", "*"]
        }
        "python" | "ruby" | "yaml" => vec!["#"],
        "typescript" | "javascript" | "jsx" | "tsx" => vec!["//", "/*", "*"],
        "sql" => vec!["--"],
        _ => vec![],
    };

    for comment in comment_prefixes {
        if prefix.starts_with(comment) {
            return false;
        }
    }

    true
}
