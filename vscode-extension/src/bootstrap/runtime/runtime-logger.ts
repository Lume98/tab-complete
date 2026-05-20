import * as vscode from 'vscode';

export interface RuntimeLogSink {
    log(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

export class RuntimeLogger implements vscode.Disposable, RuntimeLogSink {
    private readonly outputChannel = vscode.window.createOutputChannel('AI Tab Complete');

    log(message: string): void {
        this.write('INFO', message);
    }

    warn(message: string): void {
        this.write('WARN', message);
    }

    error(message: string): void {
        this.write('ERROR', message);
    }

    scoped(scope: string): RuntimeLogSink {
        return {
            log: (message) => this.log(`[${scope}] ${message}`),
            warn: (message) => this.warn(`[${scope}] ${message}`),
            error: (message) => this.error(`[${scope}] ${message}`),
        };
    }

    getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    dispose(): void {
        this.outputChannel.dispose();
    }

    private write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] [${level}] ${message}`);
    }
}
