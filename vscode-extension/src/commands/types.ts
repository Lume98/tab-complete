export interface CommandActions {
    /** 重启语言服务，使配置和 Provider 变更生效。 */
    restart(): Promise<void>;
    /** 清除服务端进程中的补全缓存。 */
    clearServerCache(): Promise<void>;
    /** 清除 VS Code 扩展进程中的补全缓存。 */
    clearClientCache(): void;
}

/** VS Code 命令注册单元：命令 ID 与可执行处理函数。 */
export interface CommandDefinition {
    commandName: string;
    commandFunction: (...args: unknown[]) => unknown | Promise<unknown>;
}
