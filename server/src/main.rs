//! AI Tab Complete LSP Server 入口
//!
//! 职责：初始化日志、配置、AI Provider、缓存，通过 stdio 启动 LSP 服务

mod ai;
mod cache;
mod completion;
mod config;
mod protocol;
mod server;

use std::sync::Arc;
use tokio::sync::RwLock;
use tower_lsp::{LspService, Server};
use tracing_subscriber::EnvFilter;

use config::AppConfig;
use server::Backend;

#[tokio::main]
async fn main() {
    // 初始化日志：输出到 stderr（避免污染 stdio LSP 通道），无 ANSI 颜色
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_ansi(false)
        .init();

    tracing::info!("Starting AI Tab Complete LSP server");

    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();

    // 加载配置（配置文件 > 环境变量 > 默认值），用 RwLock 包裹以便运行时热更新
    let config = Arc::new(RwLock::new(AppConfig::load()));
    let config_snapshot = config.read().await;

    // 根据配置创建对应的 AI Provider（Claude / OpenAI / Ollama）
    let ai_provider = Arc::new(RwLock::new(
        server::create_provider_from_config(&config_snapshot),
    ));
    tracing::info!("Initial AI provider: {}", ai_provider.read().await.name());
    drop(config_snapshot);

    // 文档状态：维护所有已打开文档的内存副本
    let documents = Arc::new(RwLock::new(server::DocumentsState::default()));
    // 服务端 LRU 缓存：1000 条目，30s TTL
    let cache = Arc::new(cache::CacheManager::new(1000, 30));

    // 构建 LSP Service，注册自定义方法 textDocument/inlineCompletion
    let (service, socket) = LspService::build(|client| Backend {
        client,
        documents,
        config,
        ai_provider,
        cache,
    })
    .custom_method(
        "textDocument/inlineCompletion",
        Backend::handle_inline_completion_lsp,
    )
    .finish();

    // 通过 stdio 启动 LSP 服务，阻塞运行直到客户端断开
    Server::new(stdin, stdout, socket)
        .serve(service)
        .await;
}
