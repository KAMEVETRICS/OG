import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

const localSecretNames = [
  'OG_RPC_URL',
  'OG_STORAGE_INDEXER_RPC',
  'OG_COMPUTE_BASE_URL',
  'OG_COMPUTE_API_KEY',
  'OG_COMPUTE_MODEL',
  'OG_PRIVATE_KEY',
  'ERC8004_IDENTITY_REGISTRY',
  'ERC8004_REPUTATION_REGISTRY',
  'CERTIFIER_DAILY_OWNER_LIMIT',
  'CERTIFIER_DAILY_GLOBAL_LIMIT',
  'SITE_ORIGIN',
] as const;

function localDevelopmentVars(): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const name of localSecretNames) {
    const value = process.env[name];
    if (value) variables[name] = value;
  }
  return variables;
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: command === 'serve'
          ? { ...localBindingConfig, vars: localDevelopmentVars() }
          : localBindingConfig,
      }),
    ],
  };
});
