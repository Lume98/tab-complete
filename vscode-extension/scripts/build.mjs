import { build, context } from 'esbuild';
import { access, glob, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const outRoot = path.join(projectRoot, 'out');

const args = new Set(process.argv.slice(2));
const watchMode = args.has('--watch');

function relativeEntryName(filePath) {
    return path
        .relative(srcRoot, filePath)
        .replace(/\\/g, '/')
        .replace(/\.ts$/, '');
}

async function resolveAliasTarget(requestPath) {
    const basePath = path.join(srcRoot, requestPath.slice(2));
    const candidates = [
        `${basePath}.ts`,
        `${basePath}.tsx`,
        path.join(basePath, 'index.ts'),
        path.join(basePath, 'index.tsx'),
    ];

    for (const candidate of candidates) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // continue
        }
    }

    throw new Error(`Unable to resolve alias import: ${requestPath}`);
}

const aliasPlugin = {
    name: 'alias-at-src',
    setup(buildApi) {
        buildApi.onResolve({ filter: /^@\// }, async (args) => ({
            path: await resolveAliasTarget(args.path),
        }));
    },
};

async function collectTestEntries() {
    const entries = [];
    for await (const filePath of glob(path.join(srcRoot, 'test', '*.ts'))) {
        entries.push(filePath);
    }
    return entries;
}

async function collectIntegrationEntries() {
    const entries = [];
    for await (const filePath of glob(path.join(srcRoot, 'integration', '*.ts'))) {
        entries.push(filePath);
    }
    return entries;
}

const sharedOptions = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: true,
    tsconfig: path.join(projectRoot, 'tsconfig.json'),
    external: ['vscode'],
    logLevel: 'info',
    plugins: [aliasPlugin],
};

async function createBuildContexts() {
    const testEntries = await collectTestEntries();
    const integrationEntries = await collectIntegrationEntries();

    const extensionOptions = {
        ...sharedOptions,
        entryPoints: [path.join(srcRoot, 'extension.ts')],
        outfile: path.join(outRoot, 'extension.js'),
    };

    const testOptions = {
        ...sharedOptions,
        entryPoints: testEntries,
        outbase: srcRoot,
        outdir: outRoot,
        entryNames: '[dir]/[name]',
    };

    const integrationOptions = {
        ...sharedOptions,
        entryPoints: integrationEntries,
        outbase: srcRoot,
        outdir: outRoot,
        entryNames: '[dir]/[name]',
    };

    const options = integrationEntries.length > 0
        ? [extensionOptions, testOptions, integrationOptions]
        : [extensionOptions, testOptions];

    if (watchMode) {
        return Promise.all(options.map((buildOptions) => context(buildOptions)));
    }

    return options;
}

async function cleanOutDir() {
    await rm(outRoot, { recursive: true, force: true });
    await mkdir(outRoot, { recursive: true });
}

async function run() {
    if (watchMode) {
        const contexts = await createBuildContexts();
        await Promise.all(contexts.map((buildContext) => buildContext.watch()));
        console.log('esbuild watch started');
        return;
    }

    await cleanOutDir();
    const configs = await createBuildContexts();
    await Promise.all(configs.map((options) => build(options)));
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
