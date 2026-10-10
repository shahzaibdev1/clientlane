import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
Object.assign(process.env, loadEnv('local',process.cwd(),''));
export default defineConfig({resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},test:{include:['tests/integration/**/*.test.ts'],testTimeout:30000,hookTimeout:30000}});
