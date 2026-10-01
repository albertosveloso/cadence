# Site do Cadence

Site estático com a documentação do usuário final, a identidade visual do app e o link de download
do instalador. **Sem build, sem dependências**: são arquivos prontos para subir em qualquer
hospedagem estática.

```
site/
  index.html      a página inteira
  estilo.css      a folha de estilo
  cadence.svg     o ícone do app, como favicon e marca
  img/
    tela-principal.png
    tela-calendario.png
```

O instalador **não** faz parte do site — ele é hospedado à parte, no Google Drive.
Pesado, o site tem cerca de 110 KB, então sobe em qualquer host, inclusive GitHub Pages e
Cloudflare Pages.

---

## 1. O link do instalador

Já está aplicado nos dois botões do `index.html`:

```
https://drive.usercontent.google.com/download?id=1nfWeaETa3ZKIQuvm7omKkOi_aBX3jB_o&export=download&confirm=t
```

Verificado anonimamente, sem sessão do Google, com curl e com user-agent de navegador:
HTTP 206, `Content-Type: application/octet-stream`,
`Content-Disposition: attachment; filename="Cadence-Setup-0.1.0.exe"`,
`Content-Range: .../95741868` e os bytes iniciais `MZ` de executável — ou seja, o arquivo, e
não a página de visualização. O SHA-256 do arquivo publicado é
`d81b388bffcbc9bbe7951c050dcae03f73a0bbb896e2ff210b5720c96f312900`.

### Como montar essa URL para uma versão futura

O link que o Drive oferece em "Compartilhar" **não serve**: ele abre a página de visualização.

1. Suba o `.exe` e, em **Compartilhar → Acesso geral**, escolha **Qualquer pessoa com o link**
   como *Leitor*. Sem isso, quem não estiver logado na sua conta recebe "acesso negado".
2. Copie o link e tire o ID do meio dele:

   ```
   https://drive.google.com/file/d/1nfWeaETa3ZKIQuvm7omKkOi_aBX3jB_o/view?usp=sharing
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  o ID
   ```

3. Monte: `https://drive.usercontent.google.com/download?id=SEU_ID&export=download&confirm=t`
4. **Teste numa janela anônima.** Se um dia parar de baixar direto, abra o link de
   compartilhamento, clique em "Fazer download mesmo assim" e copie o destino desse botão.

### Sobre o aviso de varredura do Drive

O antivírus do Drive só varre arquivos de até **100 MB**; acima disso ele mostra a página
*"Não foi possível verificar se este arquivo contém vírus"* antes de liberar o download, e isso
não é configurável nem pelo dono do arquivo.

O instalador tem **91 MB**, abaixo do limite — e o teste confirmou que o aviso não aparece. Por
isso o site **não** menciona esse aviso. Se uma versão futura passar de 100 MB, o aviso volta e
convém recolocar uma frase no passo 1 da seção **Instalar**, avisando o cliente antes que ele
desista do download.

---

## 2. Publicar

O site é estático e **não tem etapa de build**: os arquivos de `site/` vão para a raiz do
domínio como estão. Publicando a partir do repositório no GitHub, a configuração é sempre a
mesma, qualquer que seja o host:

| Campo | Valor |
|---|---|
| Comando de build | *(deixe vazio)* |
| Diretório de publicação | `site` |

Declarar um comando de build vazio é diferente de declarar um comando que não existe — se o host
insistir num campo obrigatório, use `echo ok`.

O `.gitignore` do projeto já exclui `dist/`, `out/` e `node_modules/`, então o repositório sobe
leve: o site inteiro tem cerca de 116 KB e o instalador fica no Google Drive, fora do Git.

Serve em qualquer host estático ligado ao repositório — GitHub Pages, Netlify, Vercel,
Cloudflare Pages — ou por FTP, copiando `site/` para a pasta pública do servidor.

> **GitHub Pages** publica da raiz ou de `/docs`, não de uma pasta qualquer. Para usar `site/`,
> ou você aponta uma GitHub Action para ela, ou renomeia a pasta para `docs/`. Os outros hosts
> aceitam `site` direto no campo acima.

---

## 3. Ao lançar uma versão nova

1. Suba o instalador novo para o Drive e troque as **duas** URLs de download no `index.html`.
2. Atualize o nome do arquivo no passo 1 de **Instalar**:
   `<code>Cadence-Setup-0.1.0.exe</code>`.
3. Atualize `Versão 0.1.0 · 91 MB` abaixo dos botões da capa, e o `0.1.0` do rodapé.
4. Confira se o arquivo novo continua abaixo de 100 MB — ver a seção acima.

---

## 4. Se a paleta do app mudar

As cores do site são os mesmos tokens de `src/renderer/src/index.css`, já convertidos para
hexadecimal. Para atualizar:

```bash
node scripts/listar-cores.mjs
```

e troque os valores nos dois blocos do topo de `estilo.css` (`:root` para o claro, `.escuro` para
o escuro). O resto da folha lê só os tokens — nenhuma cor está escrita fora dali.

---

## 5. Conteúdo

O texto vem de [`../MANUAL.md`](../MANUAL.md). Se um dos dois mudar, atualize o outro: o manual é
a versão para ler offline, o site é a versão para o cliente que acabou de baixar.
