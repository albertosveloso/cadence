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

O instalador **não** faz parte do site — ele é distribuído como asset de uma release no
GitHub. Por isso o site inteiro tem cerca de 116 KB e sobe em qualquer host estático.

---

## 1. O link do instalador

Já está aplicado nos dois botões do `index.html`:

```
https://github.com/albertosveloso/cadence/releases/download/0.1.0/Cadence-Setup-0.1.0.exe
```

O instalador é um **asset da release `0.1.0`** do próprio repositório. Verificado anonimamente,
sem sessão do GitHub e com user-agent de navegador: `302` para o CDN e depois `206` com
`Content-Type: application/octet-stream`,
`Content-Disposition: attachment; filename=Cadence-Setup-0.1.0.exe`,
`Content-Range: .../95741868` e os bytes iniciais `MZ` de executável. O SHA-256 do arquivo é
`d81b388bffcbc9bbe7951c050dcae03f73a0bbb896e2ff210b5720c96f312900`.

Três condições sustentam esse link, e vale conhecê-las antes de mexer:

- **O repositório precisa continuar público.** Assets de release em repositório privado exigem
  autenticação, e o botão passaria a devolver uma página de login.
- **A URL é imutável por versão.** O caminho carrega a tag (`0.1.0`) e o nome do arquivo, então
  ele nunca aponta para outro binário — o que é exatamente o que se quer num link de download.
- **A tag não pode ser reaproveitada.** Apagar e recriar a release `0.1.0` com outro arquivo
  tornaria o link mentiroso para quem já o tem.

> A release está marcada como **pré-lançamento**. O download funciona normalmente, mas ela não
> aparece como "Latest release" na página do repositório, e `releases/latest/download/...` não
> resolve para ela. Se quiser que apareça, desmarque "Set as a pre-release" na edição da release.

### Ao publicar uma versão nova

1. Crie a release com a tag da versão (ex.: `0.2.0`) e anexe o `dist/Cadence-Setup-0.2.0.exe`.
2. Troque as **duas** URLs no `index.html` — a tag e o nome do arquivo mudam.

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
leve: o site inteiro tem cerca de 116 KB e o instalador vive como asset de release, fora do Git.

Serve em qualquer host estático ligado ao repositório — GitHub Pages, Netlify, Vercel,
Cloudflare Pages — ou por FTP, copiando `site/` para a pasta pública do servidor.

> **GitHub Pages** publica da raiz ou de `/docs`, não de uma pasta qualquer. Para usar `site/`,
> ou você aponta uma GitHub Action para ela, ou renomeia a pasta para `docs/`. Os outros hosts
> aceitam `site` direto no campo acima.

---

## 3. Ao lançar uma versão nova

1. Crie a release no GitHub com a tag da versão e anexe o instalador — ver a seção 1.
2. Troque as **duas** URLs de download no `index.html`.
3. Atualize o nome do arquivo no passo 1 de **Instalar**:
   `<code>Cadence-Setup-0.1.0.exe</code>`.
4. Atualize `Versão 0.1.0 · 91 MB` abaixo dos botões da capa, e o `0.1.0` do rodapé.

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
