#!/usr/bin/env bash
set -euo pipefail

STACK="$1"
REGION="$2"

: "${PLATFORM_ADMIN_EMAIL:?PLATFORM_ADMIN_EMAIL ausente no ambiente protegido}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

CLUSTER="$(output ClusterName)"
FAMILY="$(output MigrationTaskFamily)"
SUBNETS="${PUBLIC_SUBNET_IDS:-$(output PublicSubnetIds)}"
SECURITY_GROUP="$(output AppSecurityGroupId)"

OVERRIDES="$(jq -cn --arg email "$PLATFORM_ADMIN_EMAIL" \
  '{containerOverrides: [{name: "migrate", command: ["node", "dist-scripts/scripts/platform-seed.js"], environment: [{name: "PLATFORM_ADMIN_EMAIL", value: $email}]}]}')"

ARN="$(aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILY" \
  --launch-type FARGATE \
  --overrides "$OVERRIDES" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
  --region "$REGION" \
  --query 'tasks[0].taskArn' --output text)"

echo "task: $ARN"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$ARN" --region "$REGION"

EXIT_CODE="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$ARN" --region "$REGION" \
  --query 'tasks[0].containers[0].exitCode' --output text)"

if [ "$EXIT_CODE" != "0" ]; then
  echo "seed falhou com exit code $EXIT_CODE" >&2
  exit 1
fi
echo "seed concluido"
