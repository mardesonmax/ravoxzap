#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

STACK="${1:?Usage: bash setup-infra-config.sh <stack> [env-file]}"
ENV_FILE_INPUT="${2:-}"

if [ -n "${ENV_FILE_INPUT}" ]; then
  if [[ "${ENV_FILE_INPUT}" = /* ]]; then
    ENV_FILE="${ENV_FILE_INPUT}"
  else
    ENV_FILE="${SCRIPT_DIR}/${ENV_FILE_INPUT}"
  fi
else
  ENV_FILE="${SCRIPT_DIR}/.env.infra.${STACK}"
fi

if [ ! -f "${ENV_FILE}" ]; then
  echo "Error: env file not found for stack '${STACK}'"
  echo "Create ${SCRIPT_DIR}/.env.infra.${STACK} from .env.infra.example"
  exit 1
fi

if ! command -v pulumi >/dev/null 2>&1; then
  echo "pulumi CLI not found."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required env var: ${name}"
    exit 1
  fi
}

set_cfg() {
  local key="$1"
  local value="$2"
  if [ -n "${value}" ]; then
    pulumi config set "${key}" "${value}" --stack "${STACK}"
  fi
}

set_secret_cfg() {
  local key="$1"
  local value="$2"
  if [ -n "${value}" ]; then
    pulumi config set "${key}" "${value}" --stack "${STACK}" --secret
  fi
}

require_env PROJECT_ID
require_env BILLING_ACCOUNT_ID
require_env API_BASE_URL
require_env WEB_BASE_URL
require_env STORAGE_BASE_URL
require_env R2_ENDPOINT
require_env R2_BUCKET
require_env R2_ACCESS_KEY_ID
require_env R2_SECRET_ACCESS_KEY
require_env JWT_SECRET
require_env API_KEY_SECRET
require_env ENCRYPTION_KEY
require_env WORKER_SECRET

if ! pulumi stack select "${STACK}" >/dev/null 2>&1; then
  pulumi stack init "${STACK}"
fi

echo "Configuring RavoxZap stack '${STACK}' from ${ENV_FILE}"

set_cfg gcp:project "${PROJECT_ID}"
set_cfg gcp:region "${REGION:-southamerica-east1}"

set_cfg projectId "${PROJECT_ID}"
set_cfg region "${REGION:-southamerica-east1}"
set_cfg billingAccountId "${BILLING_ACCOUNT_ID}"

set_cfg apiBaseUrl "${API_BASE_URL}"
set_cfg webBaseUrl "${WEB_BASE_URL}"
set_cfg corsOrigins "${CORS_ORIGINS:-${WEB_BASE_URL}}"

set_cfg serviceName "${CLOUD_RUN_SERVICE_NAME:-ravoxzap-api}"
set_cfg workerName "${WORKER_NAME:-ravoxzap-worker}"
set_cfg migrationJobName "${CLOUD_RUN_MIGRATION_JOB_NAME:-ravoxzap-migrate}"
set_cfg artifactRepositoryId "${ARTIFACT_REGISTRY_REPOSITORY:-ravoxzap}"
set_cfg apiImageName "${API_IMAGE_NAME:-api}"
set_cfg workerImageName "${WORKER_IMAGE_NAME:-worker}"
set_cfg initialApiImageDigest "${INITIAL_API_IMAGE_DIGEST:-}"
set_cfg initialWorkerImageDigest "${INITIAL_WORKER_IMAGE_DIGEST:-}"

set_cfg dbInstanceName "${CLOUD_SQL_INSTANCE_NAME:-ravoxzap-pg}"
set_cfg dbName "${CLOUD_SQL_DATABASE_NAME:-ravoxzap}"
set_cfg dbUserName "${CLOUD_SQL_APP_USER:-ravoxzap_app}"
set_cfg dbTier "${CLOUD_SQL_MACHINE_TIER:-db-f1-micro}"
set_cfg dbDiskGb "${CLOUD_SQL_DISK_GB:-10}"
set_cfg dbConnectionGuardrail "${DB_CONNECTION_GUARDRAIL:-40}"
set_cfg databasePoolMax "${DATABASE_POOL_MAX:-3}"

set_cfg redisInstanceName "${REDIS_INSTANCE_NAME:-ravoxzap-redis}"
set_cfg redisMemoryGb "${REDIS_MEMORY_GB:-1}"

set_cfg cloudRunMinInstances "${CLOUD_RUN_MIN_INSTANCES:-1}"
set_cfg cloudRunMaxInstances "${CLOUD_RUN_MAX_INSTANCES:-10}"
set_cfg cloudRunConcurrency "${CLOUD_RUN_CONCURRENCY:-80}"
set_cfg cloudRunCpu "${CLOUD_RUN_CPU:-1}"
set_cfg cloudRunMemory "${CLOUD_RUN_MEMORY:-1Gi}"

set_cfg workerReplicas "${WORKER_REPLICAS:-2}"
set_cfg workerCpu "${WORKER_CPU:-500m}"
set_cfg workerMemory "${WORKER_MEMORY:-1Gi}"
set_cfg workerLockTtlMs "${WORKER_LOCK_TTL_MS:-30000}"

set_cfg storageBaseUrl "${STORAGE_BASE_URL}"
set_cfg r2Endpoint "${R2_ENDPOINT}"
set_cfg r2Region "${R2_REGION:-us-east-1}"
set_cfg r2Bucket "${R2_BUCKET}"
set_cfg mediaRetentionDays "${MEDIA_RETENTION_DAYS:-7}"

set_cfg enableBudgetAlerts "${ENABLE_BUDGET_ALERTS:-true}"
set_cfg monthlyBudgetUsd "${MONTHLY_BUDGET_USD:-50}"

set_cfg githubOwner "${GITHUB_OWNER:-}"
set_cfg githubRepoName "${GITHUB_REPO_NAME:-}"
set_cfg githubBranchRegex "${GITHUB_BRANCH_REGEX:-^main$}"

set_secret_cfg jwtSecret "${JWT_SECRET}"
set_secret_cfg apiKeySecret "${API_KEY_SECRET}"
set_secret_cfg encryptionKey "${ENCRYPTION_KEY}"
set_secret_cfg workerSecret "${WORKER_SECRET}"
set_secret_cfg r2AccessKeyId "${R2_ACCESS_KEY_ID}"
set_secret_cfg r2SecretAccessKey "${R2_SECRET_ACCESS_KEY}"

echo "Done. Next: npm install && pulumi preview --stack ${STACK} && pulumi up --stack ${STACK}"
