mod app;
mod ai;
mod cache;
mod completion;
mod config;
mod lsp;
mod protocol;

use std::sync::Arc;
use tokio::sync::RwLock;
use tower_lsp::{LspService, Server};
use tracing_subscriber::EnvFilter;

use app::completion_service::CompletionService;
use app::provider_factory::create_provider_from_config;
use config::AppConfig;
use lsp::{Backend, DocumentsState};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_ansi(false)
        .init();

    tracing::info!("Starting AI Tab Complete LSP server");

    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    let config = Arc::new(RwLock::new(AppConfig::load()));
    let config_snapshot = config.read().await;

    let ai_provider = Arc::new(RwLock::new(create_provider_from_config(&config_snapshot)));
    tracing::info!("Initial AI provider: {}", ai_provider.read().await.name());
    drop(config_snapshot);

    let documents = Arc::new(RwLock::new(DocumentsState::default()));
    let cache = Arc::new(cache::CacheManager::new(1000, 30));
    let completion_service = Arc::new(CompletionService::new(
        config.clone(),
        ai_provider.clone(),
        cache.clone(),
    ));

    let (service, socket) = LspService::build(|client| Backend {
        client,
        documents,
        completion_service,
    })
    .custom_method(
        "textDocument/inlineCompletion",
        Backend::handle_inline_completion_lsp,
    )
    .finish();

    Server::new(stdin, stdout, socket)
        .serve(service)
        .await;
}
