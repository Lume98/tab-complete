use std::sync::Arc;

use tokio::sync::RwLock;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer};

use crate::app::completion_service::CompletionService;
use crate::protocol::{InlineCompletionList, InlineCompletionParams};

use super::documents::DocumentsState;
use super::edits::apply_incremental_edit;

pub struct Backend {
    pub client: Client,
    pub documents: Arc<RwLock<DocumentsState>>,
    pub completion_service: Arc<CompletionService>,
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _params: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::INCREMENTAL,
                )),
                ..Default::default()
            },
            server_info: Some(ServerInfo {
                name: "ai-tab-complete-lsp".to_string(),
                version: Some("0.1.0".to_string()),
            }),
        })
    }

    async fn initialized(&self, _params: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "AI Tab Complete LSP server initialized")
            .await;
        tracing::info!("AI Tab Complete LSP server initialized");
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let mut docs = self.documents.write().await;
        docs.open(params.text_document.uri, params.text_document.text);
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        let mut docs = self.documents.write().await;
        docs.apply_changes(params, apply_incremental_edit);
    }

    async fn did_close(&self, params: DidCloseTextDocumentParams) {
        let mut docs = self.documents.write().await;
        docs.close(&params.text_document.uri);
    }

    async fn did_change_configuration(&self, _params: DidChangeConfigurationParams) {
        tracing::info!("Configuration changed, rebuilding provider");
        self.completion_service.rebuild_provider().await;
    }
}

impl Backend {
    pub async fn handle_inline_completion_lsp(
        &self,
        params: InlineCompletionParams,
    ) -> Result<Option<InlineCompletionList>> {
        let content = {
            let docs = self.documents.read().await;
            docs.get(&params.text_document.uri)
        };

        Ok(match content {
            Some(content) => {
                self.completion_service
                    .handle_inline_completion(&self.client, params, &content)
                    .await
            }
            None => None,
        })
    }
}
