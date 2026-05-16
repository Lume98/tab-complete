use tower_lsp::lsp_types::Range;

pub fn apply_incremental_edit(content: &str, range: &Range, new_text: &str) -> Option<String> {
    let mut result = String::new();
    let lines: Vec<&str> = content.lines().collect();
    let start_line = range.start.line as usize;
    let start_char = range.start.character as usize;
    let end_line = range.end.line as usize;
    let end_char = range.end.character as usize;

    for (i, line) in lines.iter().enumerate() {
        if i < start_line {
            result.push_str(line);
            result.push('\n');
        } else if i == start_line {
            result.push_str(&line[..start_char]);
            result.push_str(new_text);
            if start_line == end_line && end_char < line.len() {
                result.push_str(&line[end_char..]);
            }
            if start_line < end_line {
                result.push('\n');
            }
        } else if i > start_line && i < end_line {
        } else if i == end_line && start_line != end_line {
            if end_char < line.len() {
                result.push_str(&line[end_char..]);
            }
            if i < lines.len() - 1 {
                result.push('\n');
            }
        } else {
            result.push_str(line);
            if i < lines.len() - 1 {
                result.push('\n');
            }
        }
    }

    Some(result)
}
