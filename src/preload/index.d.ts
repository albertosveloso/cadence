import type { CadenceApi } from '@shared/contract'

declare global {
  interface Window {
    cadence: CadenceApi
  }
}
