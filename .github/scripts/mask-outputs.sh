#!/usr/bin/env bash
set -uo pipefail

REGION="${1:?região}"
shift

KEYS="VpcId GithubDeployRoleArn RepositoryUri DatabaseInstanceId DatabaseEndpoint RedisConfigurationEndpoint AppSecurityGroupId MigrationTaskDefinitionArn"

for STACK in "$@"; do
  OUTPUTS="$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output text 2>/dev/null || true)"
  while IFS=$'\t' read -r KEY VALUE; do
    [ -n "${VALUE:-}" ] || continue
    for WANTED in $KEYS; do
      if [ "$KEY" = "$WANTED" ]; then
        echo "::add-mask::$VALUE"
      fi
    done
  done <<<"$OUTPUTS"
done
exit 0
