; Trechos NSIS injetados no instalador gerado pelo electron-builder.
; Referenciado por `nsis.include` em electron-builder.yml.

!macro customUnInstall
  ; O autostart e gravado em tempo de execucao por app.setLoginItemSettings(),
  ; e no Windows o Electron usa o AppUserModelId -- ou seja, o appId -- como
  ; NOME do valor na chave Run. O desinstalador do electron-builder limpa o
  ; registro de AUMID do shell (WinShell::UninstAppUserModelId) mas nao toca
  ; nessa chave.
  ;
  ; Sem esta linha, desinstalar deixa uma entrada de inicializacao apontando
  ; para um executavel que acabou de ser removido, e o Windows tenta lanca-la
  ; a cada boot. O usuario ve uma falha silenciosa num app que ele acha que
  ; nao tem mais.
  ;
  ; Observacao: a chave e nomeada pelo appId, e nao pelo nome do produto. Isso
  ; da um segundo motivo -- alem do guid do NSIS -- para nunca alterar o appId
  ; depois de publicar: a entrada antiga fica orfa e o app novo, com outro
  ; appId, nao tem como remove-la.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_ID}"
!macroend
