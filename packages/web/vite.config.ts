import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Files of the build the offline app doesn't need, so the service worker
 * doesn't precache them: the link preview, crawler files and the licence.
 */
const NOT_PRECACHED = /^(og-image\.png|robots\.txt|sitemap\.xml|sw\.js|fonts\/.*\.txt)$/;

/**
 * Writes `sw.js` (from src/sw.js) into the build, with the list of files to
 * precache and a version that changes whenever any of them does, so each
 * deploy installs a fresh cache. Build only: the dev server has no worker.
 */
const serviceWorker = (): Plugin => {
  let outDir = '';
  return {
    name: 'me1-mate-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .filter((path) => !NOT_PRECACHED.test(path))
        .sort();
      const hash = createHash('sha256');
      for (const path of files) hash.update(path).update(await readFile(join(outDir, path)));
      const version = hash.digest('hex').slice(0, 12);
      const worker = await readFile(new URL('./src/sw.js', import.meta.url), 'utf8');
      await writeFile(
        join(outDir, 'sw.js'),
        `const VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(files)};\n\n${worker}`,
      );
    },
  };
};

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; the deploy workflow sets this.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    tamaguiPlugin({
      config: './tamagui.config.ts',
      components: ['tamagui'],
    }),
    serviceWorker(),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Vendors in their own chunks, so a change to the app doesn't make
        // returning visitors download React and Tamagui again.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'tamagui', test: /node_modules[\\/](@tamagui[\\/]|tamagui[\\/])/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
});
