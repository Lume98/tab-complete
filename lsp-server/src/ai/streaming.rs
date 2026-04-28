use crate::ai::CompletionChunk;

/// Claude SSE 事件类型
#[derive(Debug, Clone)]
pub enum ClaudeSseEvent {
    /// 消息开始，包含 message ID
    MessageStart { message_id: String },
    /// 内容块开始
    ContentBlockStart,
    /// 文本增量
    TextDelta { text: String },
    /// 内容块结束
    ContentBlockStop,
    /// 消息增量（包含 stop_reason）
    MessageDelta { stop_reason: Option<String> },
    /// 消息结束
    MessageStop,
    /// 心跳
    Ping,
    /// 错误
    Error { message: String },
}

/// 解析 Claude 流式 SSE 事件
/// Claude 格式:
///   event: message_start
///   data: {"type":"message_start","message":{"id":"msg_...", ...}}
///
///   event: content_block_delta
///   data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"..."}}
///
///   event: message_stop
///   data: {"type":"message_stop"}
pub fn parse_claude_sse(event_type: &str, data: &str) -> Option<ClaudeSseEvent> {
    match event_type {
        "message_start" => {
            let msg_id = serde_json::from_str::<serde_json::Value>(data)
                .ok()
                .and_then(|v| v.get("message").and_then(|m| m.get("id")).and_then(|id| id.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            Some(ClaudeSseEvent::MessageStart { message_id: msg_id })
        }
        "content_block_start" => Some(ClaudeSseEvent::ContentBlockStart),
        "content_block_delta" => {
            let text = serde_json::from_str::<serde_json::Value>(data)
                .ok()
                .and_then(|v| v.get("delta").and_then(|d| d.get("text")).and_then(|t| t.as_str()).map(|s| s.to_string()))
                .unwrap_or_default();
            if text.is_empty() {
                None
            } else {
                Some(ClaudeSseEvent::TextDelta { text })
            }
        }
        "content_block_stop" => Some(ClaudeSseEvent::ContentBlockStop),
        "message_delta" => {
            let stop_reason = serde_json::from_str::<serde_json::Value>(data)
                .ok()
                .and_then(|v| v.get("delta").and_then(|d| d.get("stop_reason")).and_then(|s| s.as_str()).map(|s| s.to_string()));
            Some(ClaudeSseEvent::MessageDelta { stop_reason })
        }
        "message_stop" => Some(ClaudeSseEvent::MessageStop),
        "ping" => Some(ClaudeSseEvent::Ping),
        "error" => {
            let msg = serde_json::from_str::<serde_json::Value>(data)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| data.to_string());
            Some(ClaudeSseEvent::Error { message: msg })
        }
        _ => None,
    }
}

/// 将 Claude SSE 事件转换为 CompletionChunk
pub fn claude_event_to_chunk(event: &ClaudeSseEvent, completion_id: &str) -> Option<CompletionChunk> {
    match event {
        ClaudeSseEvent::TextDelta { text } => Some(CompletionChunk {
            token: text.clone(),
            done: false,
            completion_id: completion_id.to_string(),
        }),
        ClaudeSseEvent::MessageStop => Some(CompletionChunk {
            token: String::new(),
            done: true,
            completion_id: completion_id.to_string(),
        }),
        ClaudeSseEvent::MessageDelta { stop_reason: _ } => Some(CompletionChunk {
            token: String::new(),
            done: true,
            completion_id: completion_id.to_string(),
        }),
        _ => None,
    }
}

/// 解析 OpenAI SSE data 行
pub fn parse_openai_sse(data: &str) -> Option<CompletionChunk> {
    if data == "[DONE]" {
        return Some(CompletionChunk {
            token: String::new(),
            done: true,
            completion_id: String::new(),
        });
    }

    let val = serde_json::from_str::<serde_json::Value>(data).ok()?;
    let choice = val.get("choices")?.get(0)?;
    let token = choice
        .get("delta")
        .and_then(|d| d.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    let finish = choice
        .get("finish_reason")
        .and_then(|f| f.as_str())
        .is_some();
    let id = val
        .get("id")
        .and_then(|id| id.as_str())
        .unwrap_or("")
        .to_string();

    Some(CompletionChunk {
        token,
        done: finish,
        completion_id: id,
    })
}

/// SSE 行缓冲解析器
/// 从字节流中提取完整的 event+data 行对
pub struct SseParser {
    buffer: String,
    current_event_type: String,
}

impl SseParser {
    pub fn new() -> Self {
        Self {
            buffer: String::new(),
            current_event_type: String::new(),
        }
    }

    /// 追加新数据并返回解析出的事件列表
    /// 每个元素是 (event_type, data)
    pub fn feed(&mut self, chunk: &str) -> Vec<(String, String)> {
        self.buffer.push_str(chunk);
        let mut events = Vec::new();

        while let Some(pos) = self.buffer.find("\n\n") {
            let block = self.buffer[..pos].to_string();
            self.buffer = self.buffer[pos + 2..].to_string();

            let mut event_type = String::new();
            let mut data_lines = Vec::new();

            for line in block.lines() {
                if let Some(et) = line.strip_prefix("event: ") {
                    event_type = et.to_string();
                } else if let Some(d) = line.strip_prefix("data: ") {
                    data_lines.push(d);
                }
            }

            if !data_lines.is_empty() {
                events.push((event_type, data_lines.join("\n")));
            }
        }

        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_text_delta() {
        let event = parse_claude_sse(
            "content_block_delta",
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"fn "}}"#,
        );
        match event {
            Some(ClaudeSseEvent::TextDelta { text }) => assert_eq!(text, "fn "),
            _ => panic!("Expected TextDelta"),
        }
    }

    #[test]
    fn test_sse_parser() {
        let mut parser = SseParser::new();
        let events = parser.feed(
            "event: content_block_delta\n\
             data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"hello\"}}\n\n\
             event: message_stop\n\
             data: {\"type\":\"message_stop\"}\n\n",
        );
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].0, "content_block_delta");
        assert_eq!(events[1].0, "message_stop");
    }

    #[test]
    fn test_sse_parser_partial() {
        let mut parser = SseParser::new();
        let events1 = parser.feed("event: content_block_delta\n");
        assert!(events1.is_empty());
        let events2 = parser.feed("data: {\"delta\":{\"text\":\"hi\"}}\n\n");
        assert_eq!(events2.len(), 1);
    }

    #[test]
    fn test_openai_sse() {
        let chunk = parse_openai_sse(
            r#"{"id":"chatcmpl-123","choices":[{"delta":{"content":"fn "},"finish_reason":null}]}"#,
        );
        assert_eq!(chunk.unwrap().token, "fn ");
    }
}
