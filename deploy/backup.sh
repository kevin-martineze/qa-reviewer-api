#!/usr/bin/env bash
# Respaldo diario de Mongo a S3: mongodump comprimido, por stdin, sin tocar el disco.
# El bucket expira los objetos a los 14 días. Lo instala el deploy en /etc/cron.d.
# Restaurar: ver docs/operations.md, «Respaldos».
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin"
cd "$(dirname "$0")"

bucket="$(grep -E '^BACKUP_BUCKET=' .env | cut -d= -f2- || true)"
if [[ -z "$bucket" ]]; then
  echo "backup: falta BACKUP_BUCKET en .env" >&2
  exit 1
fi

key="mongo/qa_reviewer-$(date -u +%Y%m%dT%H%M%SZ).archive.gz"
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongodump --quiet --archive --gzip --db qa_reviewer \
  | aws s3 cp - "s3://${bucket}/${key}" --only-show-errors
echo "backup: s3://${bucket}/${key}"
