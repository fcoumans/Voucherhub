import { defineConfig } from 'vite';

// GitHub Pages serves this repo as a project site at /Voucherhub/, not
// domain root — every root-relative asset reference in the app needs to
// resolve under that subpath, hence base here plus the %BASE_URL%/relative-
// path fixes in index.html, manifest.json, main.js and sw.js.
export default defineConfig({
  base: '/Voucherhub/',
});
