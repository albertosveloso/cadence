/** Le o appId de electron-builder.yml, a fonte unica de verdade. */
export declare function readAppId(): string

/** True enquanto o appId nao foi decidido (prefixo "pendente."). */
export declare function isPlaceholder(appId: string): boolean
