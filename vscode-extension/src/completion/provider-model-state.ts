import {
    DEFAULT_PROVIDER,
    ProviderName,
    resolveProviderModel,
} from '@/config/provider-config';

export class ProviderModelState {
    private provider: ProviderName = DEFAULT_PROVIDER;
    private model = '';

    refresh(
        providerValue: unknown,
        getSetting: (key: string) => string | undefined
    ): boolean {
        const previousProvider = this.provider;
        const previousModel = this.model;
        const resolved = resolveProviderModel(providerValue, getSetting);

        this.provider = resolved.provider;
        this.model = resolved.model ?? '';

        return previousProvider !== this.provider || previousModel !== this.model;
    }

    getProvider(): ProviderName {
        return this.provider;
    }

    getModel(): string {
        return this.model;
    }
}
