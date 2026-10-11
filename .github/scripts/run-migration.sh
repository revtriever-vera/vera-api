#!/usr/bin/env bash
set -euo pipefail

STACK="$1"
REGION="$2"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

CLUSTER="$(output ClusterName)"
FAMILY="$(output MigrationTaskFamily)"
SUBNETS="${PUBLIC_SUBNET_IDS:-$(output PublicSubnetIds)}"
SECURITY_GROUP="$(output AppSecurityGroupId)"

if [ -z "$FAMILY" ] || [ "$FAMILY" = "None" ]; then
  echo "::error::output MigrationTaskFamily ausente no stack $STACK — o cdk deploy precisa rodar antes da migração" >&2
  exit 1
fi

TASK_DEFINITION="$FAMILY"
if [ -n "${MIGRATION_IMAGE:-}" ]; then
  echo "registrando revisão da migração com a imagem $MIGRATION_IMAGE"
  DEFINITION="$(aws ecs describe-task-definition --task-definition "$FAMILY" --region "$REGION" --query 'taskDefinition')"
  UPDATED="$(echo "$DEFINITION" | jq --arg img "$MIGRATION_IMAGE" \
    'del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)
     | .containerDefinitions |= map(.image = $img)')"
  REVISION="$(aws ecs register-task-definition --region "$REGION" --cli-input-json "$UPDATED" \
    --query 'taskDefinition.revision' --output text)"
  TASK_DEFINITION="$FAMILY:$REVISION"
fi

echo "migrando em $CLUSTER com $TASK_DEFINITION"

ARN="$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$TASK_DEFINITION" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --region "$REGION" \
  --query 'tasks[0].taskArn' --output text)"

echo "task: $ARN"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$ARN" --region "$REGION"

LOG_GROUP="$(aws ecs describe-task-definition --task-definition "$FAMILY" --region "$REGION" \
  --query 'taskDefinition.containerDefinitions[0].logConfiguration.options."awslogs-group"' --output text)"
aws logs get-log-events --log-group-name "$LOG_GROUP" \
  --log-stream-name "migrate/migrate/$(basename "$ARN")" --region "$REGION" \
  --query 'events[].message' --output text 2>/dev/null | tr '\t' '\n' || true

EXIT_CODE="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" --region "$REGION" \
  --query 'tasks[0].containers[0].exitCode' --output text)"

if [ "$EXIT_CODE" != "0" ]; then
  echo "migration falhou com exit code $EXIT_CODE" >&2
  exit 1
fi
echo "migration concluida"
