import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readAppId, readDeveloper, readDisplayNames } from './scripts/app-id.mjs'

const shared = resolve(__dirname, 'src/shared')

/**
 * O appId vem de electron-builder.yml, nao de uma constante duplicada aqui.
 * app.setAppUserModelId() precisa casar exatamente com o appId do instalador,
 * e duas constantes iguais em arquivos diferentes divergem na primeira vez que
 * alguem edita uma delas.
 */
const appId = readAppId()

/**
 * ATENCAO: electron-vite@5 fixa `minify: false` como default nos tres
 * ambientes (main, preload e renderer). Sem as linhas de `minify` abaixo o
 * bundle de producao sai legivel e quase 3x maior. Nao remover.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    define: {
      __APP_ID__: JSON.stringify(appId),
      __APP_DEVELOPER__: JSON.stringify(readDeveloper()),
      __APP_NAMES__: JSON.stringify(readDisplayNames())
    },
    build: { minify: 'esbuild' }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { minify: 'esbuild' }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src'),
        '@shared': shared
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      minify: 'esbuild',
      reportCompressedSize: true,
      cssMinify: 'lightningcss'
    }
  }
})
