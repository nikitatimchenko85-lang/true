#!/usr/bin/env bash
# Выкладка на хостинг TRUE (timchenko.site): каждый файл сборки — отдельным POST в deploy.php.
# Использование: npm run build && scripts/deploy.sh [папка]   (по умолчанию папка true → https://timchenko.site/true/)
# Ключ deploy.php подставляется окружением; если нужен явно — задайте DEPLOY_KEY и DEPLOY_KEY_HEADER.
set -euo pipefail
FOLDER="${1:-true}"
URL="${DEPLOY_URL:-https://timchenko.site/deploy.php}"
cd "$(dirname "$0")/../dist"
if find . -mindepth 2 -type f | grep -q .; then echo "В сборке есть вложенные папки — хостинг их не поддерживает" >&2; exit 1; fi
extra=()
[ -n "${DEPLOY_KEY:-}" ] && extra=(-H "${DEPLOY_KEY_HEADER:-X-Deploy-Key}: $DEPLOY_KEY")
# index.html — последним, чтобы страница не ссылалась на ещё не загруженные файлы
for f in $(ls | grep -v '^index.html$') index.html; do
  printf '%s … ' "$FOLDER/$f"
  curl -fsS -X POST "${extra[@]}" -H "X-Deploy-File: $FOLDER/$f" --data-binary "@$f" "$URL"
  echo
done
echo "Готово: https://timchenko.site/$FOLDER/"
