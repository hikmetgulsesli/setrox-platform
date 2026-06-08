import { defineConfig } from 'vite';
import path from 'node:path';
import { readdirSync } from 'node:fs';

// Multi-page static site. Each subfolder under src/pages/ becomes a route.
// E.g. src/pages/healthlens/index.html → served at /healthlens/
export default defineConfig({
  root: 'src',
  publicDir: path.resolve(__dirname, 'src/public'),
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        readdirSync(path.resolve(__dirname, 'src/pages'), { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .flatMap((d) => {
            const slug = d.name;
            return [
              [`${slug}/index`, path.resolve(__dirname, `src/pages/${slug}/index.html`)],
              [`${slug}`, path.resolve(__dirname, `src/pages/${slug}/index.html`)],
            ];
          })
          .concat([['main', path.resolve(__dirname, 'src/main.html')]]),
      ),
    },
  },
  resolve: {
    alias: {
      '@setrox/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
