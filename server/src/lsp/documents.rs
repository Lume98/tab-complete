use std::collections::HashMap;

use tower_lsp::lsp_types::{DidChangeTextDocumentParams, Range, Url};

#[derive(Debug, Default)]
pub struct DocumentsState {
    docs: HashMap<Url, String>,
}

impl DocumentsState {
    pub fn open(&mut self, uri: Url, text: String) {
        self.docs.insert(uri, text);
    }

    pub fn apply_changes(
        &mut self,
        params: DidChangeTextDocumentParams,
        apply_incremental_edit: fn(&str, &Range, &str) -> Option<String>,
    ) {
        if let Some(content) = self.docs.get_mut(&params.text_document.uri) {
            for change in params.content_changes {
                match change.range {
                    Some(range) => {
                        if let Some(new_content) =
                            apply_incremental_edit(content, &range, &change.text)
                        {
                            *content = new_content;
                        }
                    }
                    None => {
                        *content = change.text;
                    }
                }
            }
        }
    }

    pub fn close(&mut self, uri: &Url) {
        self.docs.remove(uri);
    }

    pub fn get(&self, uri: &Url) -> Option<String> {
        self.docs.get(uri).cloned()
    }
}
