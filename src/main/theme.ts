import { nativeTheme } from 'electron'
import { getSettings } from './store'

/**
 * O processo principal e a autoridade sobre o tema, nao o renderer.
 *
 * `nativeTheme.themeSource = 'system'` faz o Electron acompanhar o Windows
 * sozinho; o renderer apenas recebe `darkMode` resolvido no snapshot e aplica
 * a classe. Se a decisao ficasse no renderer com matchMedia, a preferencia
 * "claro"/"escuro" explicita nao teria efeito e a janela abriria com o tema
 * do sistema por um instante.
 */

export function applyThemePreference(): void {
  nativeTheme.themeSource = getSettings().theme
}

export function isDarkMode(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function onThemeUpdated(listener: () => void): () => void {
  nativeTheme.on('updated', listener)
  return () => {
    nativeTheme.off('updated', listener)
  }
}
