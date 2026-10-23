#!/usr/bin/env bash
# Monta _site/, que é publicado em <homolog>/labs pelo deploy-labs.yml.
#
# Convenção por item (pocs/, spikes/ ou benchmarks/<nome>/, com README.md e labs.json):
#   public/        -> webroot da demo (PHP/HTML)
#   package.json   -> script "verify": roda e publica a saída na página do item (falhou, o build falha)
#                     script "build":  roda o build com base /labs/<grupo>/<nome>/dist/
#   o resto        -> sobe para o servidor (os require relativos precisam), mas fica bloqueado (403)
#
# A página de portfólio (index.html + catalogo/<nome>/) é gerada por site/build.mjs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_site"
BASE="${LABS_BASE:-/labs}"

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$ROOT/site/.htaccess" "$OUT/.htaccess"

# Remove cores ANSI e caminhos absolutos da máquina (local ou runner) da saída publicada.
clean_output() { sed -e 's/\x1b\[[0-9;]*m//g' -e "s|$1/||g" -e "s|$1|.|g"; }

for dir in "$ROOT"/pocs/*/ "$ROOT"/spikes/*/ "$ROOT"/benchmarks/*/; do
  [ -d "$dir" ] || continue
  dir="${dir%/}"
  # Placeholder vazio (só .gitkeep) ainda não é item do catálogo.
  [ -n "$(find "$dir" -mindepth 1 -maxdepth 1 ! -name .gitkeep -print -quit)" ] || continue

  group="$(basename "$(dirname "$dir")")"
  name="$(basename "$dir")"
  rel="$group/$name"

  if [ -f "$dir/package.json" ]; then
    (cd "$dir" && yarn install --frozen-lockfile --silent)

    if grep -q '"verify"[[:space:]]*:' "$dir/package.json"; then
      echo "verify: $rel"
      mkdir -p "$OUT/catalogo/$name"
      log="$OUT/catalogo/$name/execucao.txt"
      if ! (cd "$dir" && yarn --silent verify) > "$log" 2>&1; then
        cat "$log"
        echo "ERRO: yarn verify falhou em $rel" >&2
        exit 1
      fi
      clean_output "$dir" < "$log" > "$log.tmp" && mv "$log.tmp" "$log"
      cat "$log"
    fi

    if grep -q '"build"[[:space:]]*:' "$dir/package.json"; then
      echo "build: $rel"
      (cd "$dir" && yarn build --base="$BASE/$rel/dist/")
    fi
  fi

  mkdir -p "$OUT/$rel"
  rsync -a --exclude node_modules --exclude '.cache-*' --exclude '.git*' --exclude '*.env.php' --exclude '.env*' "$dir/" "$OUT/$rel/"

  # Defesa em profundidade: toda pasta de primeiro nível que não seja public/ ou dist/ ganha "Require all denied".
  for sub in "$OUT/$rel"/*/; do
    [ -d "$sub" ] || continue
    case "$(basename "$sub")" in public|dist) ;; *) printf 'Require all denied\n' > "$sub/.htaccess" ;; esac
  done
done

# Página de portfólio (home + detalhe de cada item).
(cd "$ROOT/site" && yarn install --frozen-lockfile --silent && node build.mjs "$OUT")

# Nenhum arquivo de ambiente pode ir para o servidor.
if find "$OUT" \( -name '*.env.php' -o -name '.env*' \) | grep -q .; then
  echo "ERRO: arquivo de ambiente encontrado em _site/" >&2
  exit 1
fi

echo "_site/ montado."
