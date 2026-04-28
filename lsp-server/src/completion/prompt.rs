use crate::completion::context::CompletionRequest;

/// Prompt 模板
pub struct PromptBuilder;

impl PromptBuilder {
    /// 构建 Claude API 格式的 Prompt
    pub fn build_claude_prompt(request: &CompletionRequest) -> String {
        format!(
            r#"你是一个优秀的代码自动补全助手。请根据上下文完成光标位置后的代码。
只输出补全内容，不要任何解释。确保补全的代码风格与上下文一致。

语言: {language}
文件路径: {file_path}

上文:
```{language}
{context_before}
```

光标所在行:
{current_line_prefix}<CURSOR>{current_line_suffix}

下文:
```{language}
{context_after}
```

{syntax_context}

请只输出光标位置的补全代码："#,
            language = request.language,
            file_path = request.file_path,
            context_before = request.context_before.join("\n"),
            current_line_prefix = request.prefix,
            current_line_suffix = request.suffix,
            context_after = request.context_after.join("\n"),
            syntax_context = Self::build_syntax_context(&request.syntax_context),
        )
    }

    /// 构建 OpenAI Chat 格式的 messages
    pub fn build_openai_messages(
        request: &CompletionRequest,
    ) -> Vec<serde_json::Value> {
        vec![
            serde_json::json!({
                "role": "system",
                "content": "你是一个优秀的代码自动补全助手。请根据上下文完成光标位置后的代码。只输出补全内容，不要任何解释。"
            }),
            serde_json::json!({
                "role": "user",
                "content": format!(
                    "语言: {}\n文件路径: {}\n\n上文:\n```{}\n{}\n```\n\n光标处:\n{}<CURSOR>{}\n\n下文:\n```\n{}\n```\n\n{}请只输出补全代码：",
                    request.language,
                    request.file_path,
                    request.language,
                    request.context_before.join("\n"),
                    request.prefix,
                    request.suffix,
                    request.context_after.join("\n"),
                    Self::build_syntax_context(&request.syntax_context),
                )
            }),
        ]
    }

    /// 构建 Ollama FIM 格式
    pub fn build_ollama_fim_prompt(request: &CompletionRequest) -> String {
        format!(
            "<PRE>{prefix}<SUF>{suffix}<MID>",
            prefix = request.context_before.join("\n"),
            suffix = request.context_after.join("\n"),
        )
    }

    fn build_syntax_context(syntax: &Option<super::context::SyntaxContext>) -> String {
        match syntax {
            Some(ctx) => {
                let mut parts = Vec::new();
                if let Some(func) = &ctx.current_function {
                    parts.push(format!("当前函数: {}", func));
                }
                if let Some(class) = &ctx.current_class {
                    parts.push(format!("当前类: {}", class));
                }
                if !ctx.imports.is_empty() {
                    parts.push(format!("导入: {}", ctx.imports.join(", ")));
                }
                if !ctx.scope_variables.is_empty() {
                    parts.push(format!("局部变量: {}", ctx.scope_variables.join(", ")));
                }
                if parts.is_empty() {
                    String::new()
                } else {
                    format!("语法上下文:\n{}\n\n", parts.join("\n"))
                }
            }
            None => String::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::completion::context::CompletionRequest;

    #[test]
    fn test_build_claude_prompt() {
        let request = CompletionRequest {
            file_path: "/test/test.rs".to_string(),
            prefix: "let x = ".to_string(),
            suffix: String::new(),
            language: "rust".to_string(),
            context_before: vec!["fn test() {".to_string()],
            context_after: vec!["}".to_string()],
            syntax_context: None,
        };

        let prompt = PromptBuilder::build_claude_prompt(&request);
        assert!(prompt.contains("rust"));
        assert!(prompt.contains("let x = "));
        assert!(prompt.contains("fn test()"));
    }
}
