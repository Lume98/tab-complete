import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionDevelopmentPath = path.resolve(__dirname, '..');
const extensionTestsPath = path.resolve(extensionDevelopmentPath, 'out', 'integration', 'suite.js');
const testDataPath = path.join(os.tmpdir(), 'ai-tab-complete-vscode-test-data');
const testExtensionsPath = path.join(os.tmpdir(), 'ai-tab-complete-vscode-test-extensions');
const defaultWindowsCodePath = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Programs',
    'Microsoft VS Code',
    'Code.exe'
);

async function resolveLaunchOptions() {
    if (process.env.VSCODE_TEST_EXECUTABLE) {
        return process.env.VSCODE_TEST_EXECUTABLE;
    }

    if (process.env.VSCODE_TEST_USE_DOWNLOAD !== '1' && process.platform === 'win32') {
        try {
            await access(defaultWindowsCodePath);
            return defaultWindowsCodePath;
        } catch {
            // Fall back to @vscode/test-electron download behavior below.
        }
    }

    return downloadAndUnzipVSCode();
}

try {
    const executablePath = await resolveLaunchOptions();
    console.log(`Running VS Code integration tests with ${executablePath}`);

    await runVSCodeTests(executablePath, [
        '--user-data-dir',
        testDataPath,
        '--extensions-dir',
        testExtensionsPath,
        '--disable-extensions',
        '--disable-extension',
        'github.copilot-chat',
        '--disable-workspace-trust',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-sandbox',
        '--disable-gpu-sandbox',
        `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
        `--extensionTestsPath=${extensionTestsPath}`,
    ]);
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}

function runVSCodeTests(executablePath, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(executablePath, args, {
            env: process.env,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });
        let settled = false;

        child.stdout.on('data', (data) => process.stdout.write(data));
        child.stderr.on('data', (data) => process.stderr.write(filterKnownVSCodeNoise(data.toString())));
        child.on('error', reject);
        child.on('close', (code, signal) => {
            if (settled) {
                return;
            }
            settled = true;
            console.log(`Exit code:   ${code ?? signal}`);
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(signal
                ? `VS Code integration tests terminated with signal ${signal}`
                : `VS Code integration tests failed with code ${code}`));
        });
    });
}

function filterKnownVSCodeNoise(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .filter((line) => !line.includes('Error mutex already exists'))
        .filter((line) => !line.includes('at Is.installMutex'))
        .join('\n')
        .concat(text.endsWith('\n') ? '\n' : '');
}
