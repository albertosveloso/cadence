/**
 * Injetado em tempo de build por electron.vite.config.ts, lido de
 * electron-builder.yml. Tem de casar com o appId do instalador -- ver o
 * comentario no topo daquele arquivo.
 */
declare const __APP_ID__: string

/**
 * Injetado em tempo de build, lido de `appx.publisherDisplayName` em
 * electron-builder.yml -- o mesmo valor registrado no Partner Center.
 */
declare const __APP_DEVELOPER__: string

/**
 * Nomes exibidos, injetados em tempo de build de electron-builder.yml.
 * `app.getName()` NAO serve aqui: devolve o `name` do package.json.
 */
declare const __APP_NAMES__: { product: string; msix: string }
