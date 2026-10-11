#!/usr/bin/env bash
set -euo pipefail

DATA_STACK="${1:?stack de dados}"
REGION="${2:?região}"
WAIT_SECONDS="${3:-900}"

INSTANCE="$(aws cloudformation describe-stacks --stack-name "$DATA_STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='DatabaseInstanceId'].OutputValue" --output text 2>/dev/null || true)"

if [ -z "$INSTANCE" ] || [ "$INSTANCE" = "None" ]; then
  echo "stack de dados sem o identificador da instância — nada a acordar"
  exit 0
fi

status_of() {
  aws rds describe-db-instances --db-instance-identifier "$INSTANCE" --region "$REGION" \
    --query 'DBInstances[0].DBInstanceStatus' --output text
}

STATUS="$(status_of)"
echo "banco $INSTANCE está $STATUS"

case "$STATUS" in
  available)
    exit 0
    ;;
  stopped)
    echo "ligando $INSTANCE"
    aws rds start-db-instance --db-instance-identifier "$INSTANCE" --region "$REGION" >/dev/null
    ;;
  starting | configuring-enhanced-monitoring | modifying | backing-up)
    echo "já está subindo, apenas esperando"
    ;;
  stopping)
    echo "está desligando; esperando parar para poder ligar de novo"
    while [ "$(status_of)" = "stopping" ]; do sleep 15; done
    aws rds start-db-instance --db-instance-identifier "$INSTANCE" --region "$REGION" >/dev/null
    ;;
  *)
    echo "estado inesperado ($STATUS) — seguindo e deixando a migração falhar com a mensagem real"
    exit 0
    ;;
esac

DEADLINE=$((SECONDS + WAIT_SECONDS))
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  STATUS="$(status_of)"
  if [ "$STATUS" = "available" ]; then
    echo "banco disponível"
    exit 0
  fi
  echo "aguardando ($STATUS)"
  sleep 15
done

echo "banco não ficou disponível em ${WAIT_SECONDS}s" >&2
exit 1
