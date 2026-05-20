import {
    Disposable,
    InlineCompletionItemProvider,
    InlineCompletionContext,
    InlineCompletionItem,
    InlineCompletionList as VsCodeInlineCompletionList,
    TextDocument,
    Position,
    CancellationToken,
    commands,
} from 'vscode';
import { InlineCompletionClient } from '@/core/completion-client/inline-completion-client';
import { Debouncer } from '@/completion/debounce';
import { ClientCache } from '@/completion/cache';
import type { Settings } from '@/core/config/settings';
import {
    PROVIDER_MODEL_KEYS,
} from '@/core/config/provider-config';
import { InlineCompletionResolver } from '@/completion/inline-completion-resolver';
import { ProviderModelState } from '@/completion/provider-model-state';
import { StreamTracker } from '@/completion/stream-tracker';

/**
 * VS Code inline completion provider。
 * 数据流：
 * 1. 编辑器触发 provideInlineCompletionItems
 * 2. debounce 防抖(150ms) → 检查自动补全开关 → 清除前一次 cancellation
 * 3. ClientCache 查询 (key: uri + version + line + prefix + provider + model)
 * 4. 缓存未命中 → LSP/mock 请求补全
 * 5. 流式补全：streamId 关联，Server 推送 SSE 更新 → streamTracker 记录 → 触发重新请求 Provider
 * 6. 非流式补全：直接缓存结果
 */
export class AIInlineCompletionProvider implements InlineCompletionItemProvider {
    // 防抖器：延迟触发补全请求，避免频繁网络请求
    private debouncer: Debouncer;
    // 补全客户端（LSP 或 mock）
    private lspClient: InlineCompletionClient;
    // VS Code Settings 引用
    private settings: Pick<Settings, 'get' | 'onDidChange'>;
    // 客户端缓存：LRU(100), TTL(5s)，与 Server 端 LruCache 配合实现双层缓存
    private clientCache: ClientCache;
    // disposable 管理
    private readonly disposables: Disposable[] = [];
    // provider/model 状态管理：根据设置获取当前提供商和模型
    private readonly providerModelState = new ProviderModelState();
    // 流式状态追踪：记录当前活跃流的 streamId 和累积文本
    private readonly streamTracker = new StreamTracker();
    // 请求解析器：构建请求、查询缓存、触发 LSP 调用
    private readonly resolver: InlineCompletionResolver;

    constructor(
        lspClient: InlineCompletionClient,
        settings: Pick<Settings, 'get' | 'onDidChange'>,
        private readonly triggerInlineSuggest: () => void = () => {
            void commands.executeCommand('editor.action.inlineSuggest.trigger');
        }
    ) {
        this.lspClient = lspClient;
        this.settings = settings;
        // 初始化防抖器
        this.debouncer = new Debouncer(settings.get<number>('debounceMs', null) ?? 150);
        // 初始化客户端缓存：100 条目，5s TTL
        this.clientCache = new ClientCache(100, 5000);
        // 初始化请求解析器
        this.resolver = new InlineCompletionResolver(
            this.lspClient,
            this.clientCache,
            this.streamTracker,
            this.providerModelState
        );

        this.refreshResolvedProvider();

        // 监听配置变更
        this.disposables.push(settings.onDidChange((key, value) => {
            // 防抖延迟变更：刷新 debouncer
            if (key === 'debounceMs') {
                this.debouncer.updateDelay(value as number);
            }
            // provider 或 model 变更：清空缓存（前后上下文和模型不同，缓存无效）
            if (key === 'provider' || PROVIDER_MODEL_KEYS.includes(key)) {
                if (this.refreshResolvedProvider()) {
                    this.resolver.clearCache();
                }
            }
        }));

        // 监听流式更新：Server 推送新 token → 更新 streamTracker → 触发重新请求
        this.disposables.push(this.lspClient.onStreamUpdate((params) => {
            if (this.streamTracker.update(params.streamId, params.text, params.done)) {
                this.triggerInlineSuggest();
            }
        }));
    }

    async provideInlineCompletionItems(
        document: TextDocument,
        position: Position,
        context: InlineCompletionContext,
        token: CancellationToken
    ): Promise<InlineCompletionItem[] | VsCodeInlineCompletionList | undefined> {
        // 1. 从每个文档的设置中获取防抖延迟（可能被 workspace 或 folder 级设置覆盖）
        this.debouncer.updateDelay(this.settings.get<number>('debounceMs', document.uri) ?? 150);

        // 2. 检查是否启用自动补全
        if (!this.settings.get<boolean>('enableAutoCompletion', document.uri)) {
            return undefined;
        }

        // 3. 检查 cancellation token（用户继续输入或主动取消）
        if (token.isCancellationRequested) {
            return undefined;
        }

        // 4. 防抖等待（150ms 默认）
        const shouldContinue = await this.debouncer.wait(token);
        if (!shouldContinue) {
            return undefined;
        }

        // 5. 解析补全请求：缓存查询 → LSP 调用 → 结果缓存
        return this.resolver.resolve(document, position, context, token);
    }

    getCurrentStreamText(): string {
        return this.streamTracker.getText();
    }

    clearStream(): void {
        this.streamTracker.clear();
    }

    clearCache(): void {
        this.resolver.clearCache();
    }

    dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables.length = 0;
    }

    private refreshResolvedProvider(): boolean {
        return this.providerModelState.refresh(
            this.settings.get<string>('provider', null),
            (key) => this.settings.get<string>(key, null)
        );
    }
}
