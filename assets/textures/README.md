# Textures

## paper-bg.jpg (ou .webp)

Imagem de fundo principal do app. Formato **portrait 9:16** (idealmente 1080×1920). Alvo de peso: **<200KB**.

Usada em `.grain-overlay` (global, fixed, cover, opacity 0.45, multiply blend).

Se não existir, o app usa a cor sólida `--zine-paper` (#ecd9b3) como fallback — continua funcional, só fica mais "chapado".

### Prompt sugerido (gerar em IA)

> Extremely aged and weathered Thrasher skateboard magazine cover from 1987, photographed flat on a table, the paper is so old and sun-faded that the original photos and text are almost completely washed out — only faint ghostly impressions of a skater mid-trick remain visible, dominant color is warm off-white cream (#ecd9b3) with yellowed edges and brown coffee stain rings, deep creases and fold lines across the middle, torn corners, tape residue in spots, slight red ink bleed suggesting the faded Thrasher flame logo at top, heavy paper grain and xerox texture, 90s skateboard zine aesthetic, portrait orientation 9:16, no readable text, no sharp logos, no borders, ultra low contrast, analog handmade feel, shot with natural diffused light

Depois, passar em um compressor (Squoosh, TinyPNG) antes de subir.
