#!/usr/bin/env bash
# Monta _site/, que é publicado em <homolog>/labs pelo deploy-labs.yml.
#
# Convenção por spike/benchmark (<grupo>/<nome>/ com README.md):
#   public/        -> webroot da demo (PHP/HTML)
#   package.json   -> se tiver script "build", roda o build com base /labs/<grupo>/<nome>/dist/
#   o resto        -> sobe para o servidor (os require relativos precisam), mas fica bloqueado (403)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_site"
BASE="${LABS_BASE:-/labs}"
REPO="${GITHUB_REPOSITORY:-pvmovel/pmlife-labs}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT/site/.htaccess" "$OUT/.htaccess"

html_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

items=""
count=0
for dir in "$ROOT"/spikes/*/ "$ROOT"/benchmarks/*/; do
  [ -f "$dir/README.md" ] || continue
  dir="${dir%/}"
  group="$(basename "$(dirname "$dir")")"
  name="$(basename "$dir")"
  rel="$group/$name"

  if [ -f "$dir/package.json" ] && grep -q '"build"[[:space:]]*:' "$dir/package.json"; then
    echo "build: $rel"
    (cd "$dir" && yarn install --frozen-lockfile && yarn build --base="$BASE/$rel/dist/")
  fi

  mkdir -p "$OUT/$rel"
  rsync -a --exclude node_modules --exclude '.git*' --exclude '*.env.php' --exclude '.env*' "$dir/" "$OUT/$rel/"

  # Defesa em profundidade: toda pasta de primeiro nível que não seja public/ ou dist/ ganha "Require all denied".
  for sub in "$OUT/$rel"/*/; do
    [ -d "$sub" ] || continue
    case "$(basename "$sub")" in public|dist) ;; *) printf 'Require all denied\n' > "$sub/.htaccess" ;; esac
  done

  title="$(grep -m1 '^# ' "$dir/README.md" | sed 's/^# //' | html_escape)"
  demo=""
  for webroot in public dist; do
    [ -d "$OUT/$rel/$webroot" ] || continue
    if [ -n "$(find "$OUT/$rel/$webroot" -maxdepth 1 -type f -name 'index.*' -print -quit)" ]; then
      demo="$rel/$webroot/"
    else # sem index: aponta para o primeiro .html/.php
      entry="$(find "$OUT/$rel/$webroot" -maxdepth 1 -type f \( -name '*.html' -o -name '*.php' \) -printf '%f\n' | sort | head -n1)"
      [ -n "$entry" ] && demo="$rel/$webroot/$entry"
    fi
    break
  done
  demo_link=""
  [ -n "$demo" ] && demo_link=" · <a href=\"$demo\">demo</a>"

  items+="      <li><span class=\"tag\">$group</span><strong>$title</strong><br><code>$rel</code> · <a href=\"https://github.com/$REPO/tree/main/$rel\">código</a>$demo_link</li>"$'\n'
  count=$((count + 1))
done

cat > "$OUT/index.html" <<HTML
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PMLife Labs</title>
  <style>
    :root { --bg:#fafafa; --fg:#1d1d1f; --muted:#6e6e73; --card:#fff; --line:#e5e5ea; --accent:#0a66c2; }
    @media (prefers-color-scheme: dark) { :root { --bg:#111; --fg:#f2f2f2; --muted:#a1a1a6; --card:#1c1c1e; --line:#2c2c2e; --accent:#5ea8ff; } }
    body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; }
    main { max-width:760px; margin:0 auto; padding:32px 16px; }
    h1 { margin:0 0 4px; } p { color:var(--muted); margin:0 0 24px; }
    ul { list-style:none; padding:0; margin:0; display:grid; gap:12px; }
    li { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
    a { color:var(--accent); } code { color:var(--muted); font-size:.85em; }
    .tag { font-size:.75em; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-right:8px; }
  </style>
</head>
<body>
  <main>
    <h1>PMLife Labs 🧪</h1>
    <p>Spikes e PoCs de arquitetura publicados automaticamente a partir de <a href="https://github.com/$REPO">$REPO</a>.</p>
    <ul>
$items    </ul>
  </main>
</body>
</html>
HTML

# Nenhum arquivo de ambiente pode ir para o servidor.
if find "$OUT" \( -name '*.env.php' -o -name '.env*' \) | grep -q .; then
  echo "ERRO: arquivo de ambiente encontrado em _site/" >&2
  exit 1
fi

echo "_site/ montado com $count item(ns)."
