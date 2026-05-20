import * as vscode from 'vscode';

// 日志接收器接口：标准的 log/warn/error API
export interface RuntimeLogSink {
    log(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/**
 * 运行时日志：扩展输出通道 + 时间戳 + 日志级别
 * 用户可在 VS Code 输出面板查看 "AI Tab Complete" 通道
 */
export class RuntimeLogger implements vscode.Disposable, RuntimeLogSink {
    // 扩展输出通道：VS Code UI 中显示日志
    private readonly outputChannel = vscode.window.createOutputChannel('AI Tab Complete');

    // 普通信息日志
    log(message: string): void {
        this.write('INFO', message);
    }

    // 警告日志
    warn(message: string): void {
        this.write('WARN', message);
    }

    // 错误日志
    error(message: string): void {
        this.write('ERROR', message);
    }

    // 创建作用域日志接收器：自动前缀 [scope]
    scoped(scope: string): RuntimeLogSink {
        return {
            log: (message) => this.log(`[${scope}] ${message}`),
            warn: (message) => this.warn(`[${scope}] ${message}`),
            error: (message) => this.error(`[${scope}] ${message}`),
        };
    }

    // 获取输出通道（提供给 LSP Client）
    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    // 释放资源
    dispose(): void {
        this.outputChannel.dispose();
    }

    // 内部：格式化并写入日志
    private write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }
}
