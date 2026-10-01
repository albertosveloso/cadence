/** Mostra o que um perfil novo (sem settings.json) recebe. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureStore, getSettings } from '../src/main/store.ts'

const dir = mkdtempSync(join(tmpdir(), 'cadence-novo-'))
configureStore(dir)
console.log(JSON.stringify(getSettings(), null, 2))
rmSync(dir, { recursive: true, force: true })
