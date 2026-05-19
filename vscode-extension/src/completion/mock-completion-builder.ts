export class MockCompletionBuilder {
    build(prefix: string, languageId: string): string {
        const trimmed = prefix.trimEnd();

        if (/console\.$/.test(trimmed)) {
            return 'log()';
        }

        if (/\breturn\s*$/.test(trimmed)) {
            return this.mockReturnValue(languageId);
        }

        if (/\bif\s*\($/.test(trimmed)) {
            return this.mockIfSuffix(languageId);
        }

        if (/\bfor\s*$/.test(trimmed)) {
            return this.mockForSuffix(languageId);
        }

        if (/[({[]$/.test(trimmed)) {
            return this.mockBlockSuffix(languageId);
        }

        if (!trimmed) {
            return this.mockLineSkeleton(languageId);
        }

        return this.mockExpression(languageId);
    }

    private mockReturnValue(languageId: string): string {
        switch (languageId) {
            case 'python':
                return 'None';
            case 'rust':
                return 'Ok(())';
            case 'go':
                return 'nil';
            case 'json':
                return '{}';
            default:
                return 'null;';
        }
    }

    private mockIfSuffix(languageId: string): string {
        if (languageId === 'python') {
            return 'True:\n    pass';
        }
        return 'condition) {\n    \n}';
    }

    private mockForSuffix(languageId: string): string {
        switch (languageId) {
            case 'python':
                return 'item in items:\n    pass';
            case 'rust':
                return 'item in items {\n    \n}';
            default:
                return 'const item of items) {\n    \n}';
        }
    }

    private mockBlockSuffix(languageId: string): string {
        if (languageId === 'python') {
            return '\n    pass';
        }
        return '\n    \n}';
    }

    private mockLineSkeleton(languageId: string): string {
        switch (languageId) {
            case 'typescript':
            case 'typescriptreact':
            case 'javascript':
            case 'javascriptreact':
                return 'const mockValue = await Promise.resolve();';
            case 'rust':
                return 'let result = todo!();';
            case 'python':
                return 'mock_value = None';
            case 'go':
                return 'result := doSomething()';
            case 'json':
                return '"mock": true';
            case 'markdown':
                return 'Mock completion preview';
            default:
                return 'mockCompletion()';
        }
    }

    private mockExpression(languageId: string): string {
        switch (languageId) {
            case 'typescript':
            case 'typescriptreact':
            case 'javascript':
            case 'javascriptreact':
                return '.then((value) => value)';
            case 'rust':
                return '.map(|value| value)';
            case 'python':
                return '_result';
            case 'go':
                return ' != nil {\n\treturn err\n}';
            default:
                return 'Completion';
        }
    }
}
