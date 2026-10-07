# Material de envio para a Microsoft Store

Tudo o que o Partner Center pede para publicar o **Cadence Pomodoro**.

```
store/
  LISTAGEM.md                    todos os textos, prontos para copiar e colar
  captura-1-cronometro.png       1366 x 768
  captura-2-foco.png             1366 x 768
  captura-3-configuracoes.png    1366 x 768
  captura-4-calendario.png       1366 x 768
  logo-300x300.png               ícone de bloco do aplicativo 1:1
  heroi-1920x1080.png            arte de super-herói 16:9
  raw/                           as capturas da janela, 3x, com fundo transparente
```

O pacote a enviar é `dist/Cadence-0.1.0.appx`, que não é versionado — gere com
`npm run dist:msix`.

---

## O que a documentação exige, e por que as imagens são assim

Três regras moldaram a composição das capturas. Não são preferência estética:

- **Mínimo 1366 × 768**, PNG, até 10 imagens para a família Desktop. A janela do
  Cadence tem 400 × 452 — uma captura crua seria recusada por tamanho.
- **Não adicionar logotipos, ícones ou mensagens de marketing.** Por isso as
  imagens mostram só a janela do app sobre uma superfície neutra, sem chamadas.
- **Evitar cores extremamente claras ou escuras**, e manter o essencial nos dois
  terços superiores, porque a Store pode sobrepor texto no terço inferior. É por
  isso que o fundo é um cinza médio e não o `#191A1C` do produto: sobre o preto
  do app, uma sobreposição da Store ficaria ilegível.

A arte 16:9 segue outras regras: sem texto, sem interface do aplicativo, espaço
vazio minimizado e nada de essencial no terço inferior. Daí ela ser uma
composição de anéis — cadência — e não uma captura.

---

## Regenerar

### As artes (logo e 16:9)

```bash
node scripts/generate-store-art.mjs
```

Derivam do mesmo desenho do ícone do app, importado de `generate-icons.mjs`.
Mudou a marca, rode de novo.

### As capturas

Precisa do app empacotado e de um perfil de demonstração, para o calendário não
sair vazio e o contador não mostrar zero.

1. Gere o pacote: `npm run dist` (ou use `dist/win-unpacked` de um build
   anterior).
2. Crie um perfil com histórico. O arquivo é um JSON de `"AAAA-MM-DD": ciclos`:

   ```bash
   mkdir -p /tmp/demo && echo '{"2026-10-06":5,"2026-10-07":5}' > /tmp/demo/history.json
   ```

3. Suba o app apontando para esse perfil, com depuração remota:

   ```bash
   dist/win-unpacked/Cadence.exe --user-data-dir=/tmp/demo --remote-debugging-port=9300
   ```

   O `--user-data-dir` é importante por dois motivos: isola o teste das suas
   preferências reais e evita o bloqueio de instância única, que faria o
   processo novo morrer em silêncio se o Cadence já estiver na bandeja.

4. Capture a janela em 3x, com fundo transparente, via CDP
   (`Emulation.setDefaultBackgroundColorOverride` com alfa 0 e
   `setDeviceMetricsOverride` com `deviceScaleFactor: 3`). A transparência é o
   que preserva os cantos arredondados para a composição.

5. Componha com `scripts/store-compor.html`, carregado em um navegador com
   `setDeviceMetricsOverride` de 1366 × 768 e `deviceScaleFactor: 1` — a
   emulação é o que garante o pixel exato, independentemente do zoom do monitor.

> O passo 5 usa o próprio renderer do app como motor de composição, apontado
> para o HTML local. Funciona porque é Chromium; se um dia parar de funcionar,
> qualquer navegador com CDP serve.

---

## Ao publicar uma versão nova

1. Regenere o pacote: `npm run dist:msix`.
2. Refaça as capturas se a interface mudou.
3. Atualize **Novidades nesta versão** em `LISTAGEM.md`.
4. A versão do pacote precisa ser maior que a publicada. O quarto número fica
   em zero: `0.2.0.0`.

A justificativa de `runFullTrust` normalmente **não** precisa ser repetida nas
atualizações, a menos que o pacote passe a declarar outras funcionalidades.
