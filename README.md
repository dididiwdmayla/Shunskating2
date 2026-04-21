# SHUNSKATING v2

> 瞬 · Diário pessoal de manobras · Zine de skate digital

---

## Como rodar localmente

O app é um PWA estático — nenhuma build, nenhuma dependência. Precisa apenas servir os arquivos via HTTP (não abrir direto com `file://`, porque os módulos ES e o `fetch` do JSON não funcionam assim).

### Opção 1 · Python (mais fácil)
```bash
cd shunskating
python3 -m http.server 8080
```
Abre no navegador: `http://localhost:8080`

### Opção 2 · Node
```bash
npx serve .
```

### Opção 3 · No celular
- Hospede no GitHub Pages, Vercel ou Netlify (deploy estático, sem build).
- Acesse pelo navegador do celular.
- Use "Adicionar à tela inicial" para instalar como PWA.

---

## Estrutura

```
shunskating/
├── index.html              # shell principal
├── manifest.json           # PWA manifest
├── css/
│   ├── tokens.css          # variáveis de design (paleta, tipografia, spacing)
│   ├── reset.css           # reset mínimo
│   ├── base.css            # tipografia e body
│   ├── zine-effects.css    # utilities estéticas (xerox, cut-paste, marcador...)
│   ├── components.css      # botões, inputs, chips, bottom nav, tabs, progresso
│   └── screens/
│       ├── home.css
│       ├── tricks.css
│       └── trick-detail.css
├── js/
│   ├── app.js              # bootstrap
│   ├── storage.js          # wrapper de localStorage
│   ├── navigation.js       # roteador
│   ├── utils.js            # helpers DOM
│   └── screens/
│       ├── home.js
│       ├── tricks.js
│       └── trick-detail.js
├── data/
│   └── tricks.json         # banco de manobras (seed com 10 manobras)
└── assets/
    ├── fonts/              # vazio (Google Fonts via @import por enquanto)
    ├── textures/           # vazio (grão gerado via SVG inline em CSS)
    ├── icons/              # favicon + icons PWA
    └── tricks/             # vazio (imagens de manobras virão depois)
```

---

## O que está implementado

- ✅ Estética zine 90s (xerox trêmulo, cut-paste, marcador, rotações quebradas, grão de filme global animado)
- ✅ Paleta rígida (papel off-white, tinta preta, vermelho Thrasher, amarelo marca-texto)
- ✅ Navegação entre telas com animação de cut-paste
- ✅ Tela Home (capa do zine com masthead, grid de seções, citação aleatória)
- ✅ Catálogo de manobras com busca, filtros por categoria, favoritos primeiro
- ✅ Tela de detalhe com 4 stances (Regular, Switch, Fakie, Nollie) e tabs estilo post-it
- ✅ Dicas renderizadas com tipografia zine (tabelas de diagnóstico, blockquotes, listas estilizadas)
- ✅ Sistema de progresso (5 níveis por stance) com persistência
- ✅ Anotações pessoais com auto-save
- ✅ Favoritos com estrela dourada
- ✅ Sistema de highlights (seleção de texto + 3 cores) com persistência e remoção
- ✅ 10 manobras seed com conteúdo analítico completo
- ✅ Easter egg: 5 toques no logo ativa "modo edição especial" (invertido)
- ✅ Responsive mobile-first
- ✅ Reduced motion respeitado

## O que fica pra próxima conversa

- Game of S.K.A.T.E. com bots
- Sistema de Metas (diária, semanal, mensal)
- Tela de Dicas (seções colapsáveis de teoria)
- Sistema de áudio com lazy loading
- Service worker / PWA offline completo
- Settings + export/import de dados
- Polimento final (microinterações, easter eggs extras)

---

## Adicionando mais manobras

Edite `data/tricks.json`. Cada manobra segue o schema:

```json
{
    "id": "slug-sem-espaço",
    "name": "Nome da Manobra",
    "category": "flatground | slides | grinds | manuals | connected",
    "difficulty": 1-5,
    "prerequisites": ["id-de-outra-manobra"],
    "tags": ["tag1", "tag2"],
    "tips": "<HTML com biomecânica, viradas de chave, tabela de diagnóstico, progressão>",
    "tipsFakie": "<HTML equivalente para versões Fakie/Nollie>"
}
```

O HTML em `tips` e `tipsFakie` aceita: `h2`, `h3`, `h4`, `p`, `strong`, `em`, `mark`, `ul`/`ol`/`li`, `table`, `blockquote`, `code`. A estética é aplicada automaticamente via CSS.

---

## Atalhos e easter eggs

- **5 toques no logo** da Home → ativa modo edição especial (paleta invertida).
- **Toque em um highlight** já aplicado → confirma se quer remover.

---

*Feito por Pikyl · 2026 · 瞬*
