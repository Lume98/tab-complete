use crate::ai::AIProvider;
use crate::config::{AIProviderType, AppConfig};

pub fn create_provider_from_config(config: &AppConfig) -> Box<dyn AIProvider> {
    match config.provider {
        AIProviderType::Claude => {
            let api_key = config.resolve_claude_api_key();
            tracing::debug!(
                "Claude API key: {}",
                api_key
                    .as_ref()
                    .map(|k| crate::config::env::mask_api_key(k))
                    .unwrap_or("none".to_string())
            );
            Box::new(crate::ai::claude::ClaudeProvider::new(
                api_key,
                config.claude_model.clone(),
                config.claude_api_base.clone(),
            )) as Box<dyn AIProvider>
        }
        AIProviderType::OpenAI => {
            let api_key = config.resolve_openai_api_key();
            tracing::debug!(
                "OpenAI API key: {}",
                api_key
                    .as_ref()
                    .map(|k| crate::config::env::mask_api_key(k))
                    .unwrap_or("none".to_string())
            );
            Box::new(crate::ai::openai::OpenAIProvider::new(
                api_key,
                config.openai_model.clone(),
                config.openai_api_base.clone(),
            )) as Box<dyn AIProvider>
        }
        AIProviderType::Ollama => Box::new(crate::ai::ollama::OllamaProvider::new(
            config.ollama_model.clone(),
            config.ollama_api_base.clone(),
        )) as Box<dyn AIProvider>,
    }
}
