import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function spawnTask(command, args, label) {
    const child = spawn(command, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
    });

    child.on('exit', (code, signal) => {
        if (signal) {
            console.log(`[watch:${label}] exited with signal ${signal}`);
            return;
        }

        if (code && code !== 0) {
            console.error(`[watch:${label}] exited with code ${code}`);
            shutdown(code);
        }
    });

    return child;
}

const children = [
    spawnTask('npm', ['run', 'typecheck:watch'], 'typecheck'),
    spawnTask('node', ['./scripts/build.mjs', '--watch'], 'bundle'),
];

let shuttingDown = false;

function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    for (const child of children) {
        if (!child.killed) {
            child.kill();
        }
    }

    process.exitCode = exitCode;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

