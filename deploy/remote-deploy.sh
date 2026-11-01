#!/usr/bin/env bash
# Corre en la instancia (SSM Run Command, como root) desde .github/workflows/deploy.yml.
# Recibe los archivos de deploy/ en base64 y la imagen a desplegar; deja el compose arriba
# y espera a que readiness responda 200. Uso: remote-deploy.sh <imagen>
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin"

image="${1:?falta la imagen}"
dir=/opt/qa-reviewer
compose=(docker compose -f "$dir/docker-compose.prod.yml")
cd "$dir"

# Primer deploy: .env con los valores no secretos que manda el workflow. Si ya existe, no se
# toca (los secretos, como RESEND_API_KEY, se agregan a mano por SSM).
if [[ ! -f .env ]]; then
  if [[ ! -f incoming/env.defaults ]]; then
    echo "deploy: falta $dir/.env (ver deploy/prod.env.example)" >&2
    exit 1
  fi
  install -m 600 incoming/env.defaults .env
  echo "deploy: .env creado con los valores por defecto"
fi
chmod 600 .env

# Archivos que el workflow dejó en $dir/incoming (compose, Caddyfile, backup.sh, env.defaults).
install -m 644 incoming/docker-compose.prod.yml docker-compose.prod.yml
install -m 644 incoming/Caddyfile Caddyfile
install -m 755 incoming/backup.sh backup.sh
rm -rf incoming
echo "30 3 * * * root $dir/backup.sh >> /var/log/qa-reviewer-backup.log 2>&1" \
  > /etc/cron.d/qa-reviewer-backup

export API_IMAGE="$image"
"${compose[@]}" pull --quiet
"${compose[@]}" up -d --remove-orphans

# Readiness desde dentro del contenedor: Mongo y S3 (rol de la instancia) responden.
for _ in $(seq 1 40); do
  if "${compose[@]}" exec -T api node -e \
    "fetch('http://127.0.0.1:3000/healthcheck/readiness-probe').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))" \
    2>/dev/null; then
    echo "deploy: $image listo"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "deploy: readiness no respondió 200 en 2 min" >&2
"${compose[@]}" ps >&2
"${compose[@]}" logs --tail 50 api >&2
exit 1
