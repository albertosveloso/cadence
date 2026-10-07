/** Le o appId de electron-builder.yml, a fonte unica de verdade. */
export declare function readAppId(): string

/** True enquanto o appId nao foi decidido (prefixo "pendente."). */
export declare function isPlaceholder(appId: string): boolean

/** Le o nome do desenvolvedor de `appx.publisherDisplayName`. */
export declare function readDeveloper(): string

/** Nomes exibidos: `productName` e `appx.displayName`. */
export declare function readDisplayNames(): { product: string; msix: string }
