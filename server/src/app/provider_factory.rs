use crate::ai::{create_provider, AIProvider, ProviderType};
use crate::config::{AIProviderType, AppConfig};

pub fn create_provider_from_config(config: &AppConfig) -> Box<dyn AIProvider> {
    let (provider_type, api_key, model, api_base) = match config.provider {
        AIProviderType::Claude => {
            let api_key = config.resolve_claude_api_key();
            tracing::debug!(
                "Claude API key: {}",
                api_key
                    .as_ref()
                    .map(|k| crate::config::env::mask_api_key(k))
                    .unwrap_or("none".to_string())
            );
            (
                ProviderType::Claude,
                api_key,
                config.claude_model.clone(),
                config.claude_api_base.clone(),
            )
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
            (
                ProviderType::OpenAI,
                api_key,
                config.openai_model.clone(),
                config.openai_api_base.clone(),
            )
        }
        AIProviderType::Ollama => (
            ProviderType::Ollama,
            None,
            config.ollama_model.clone(),
            config.ollama_api_base.clone(),
        ),
    };

    create_provider(provider_type, api_key, model, api_base)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_config_provider_to_matching_provider_name() {
        let mut config = AppConfig::default();

        config.provider = AIProviderType::Claude;
        assert_eq!(create_provider_from_config(&config).name(), "claude");

        config.provider = AIProviderType::OpenAI;
        assert_eq!(create_provider_from_config(&config).name(), "openai");

        config.provider = AIProviderType::Ollama;
        assert_eq!(create_provider_from_config(&config).name(), "ollama");
    }
}
