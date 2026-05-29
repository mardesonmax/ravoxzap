import * as gcp from '@pulumi/gcp';
import * as k8s from '@pulumi/kubernetes';
import * as pulumi from '@pulumi/pulumi';
import * as random from '@pulumi/random';

const cfg = new pulumi.Config();

const project = gcp.config.project ?? cfg.require('projectId');
const region = cfg.get('region') ?? 'southamerica-east1';
const billingAccount = cfg.require('billingAccountId').replace(/^billingAccounts\//, '');

const serviceName = cfg.get('serviceName') ?? 'ravoxzap-api';
const workerName = cfg.get('workerName') ?? 'ravoxzap-worker';
const migrationJobName = cfg.get('migrationJobName') ?? 'ravoxzap-migrate';
const artifactRepositoryId = cfg.get('artifactRepositoryId') ?? 'ravoxzap';
const apiImageName = cfg.get('apiImageName') ?? 'api';
const workerImageName = cfg.get('workerImageName') ?? 'worker';
const initialImageTag = cfg.get('initialImageTag') ?? 'latest';
const initialApiImageDigest = cfg.get('initialApiImageDigest');
const initialWorkerImageDigest = cfg.get('initialWorkerImageDigest');

const dbInstanceName = cfg.get('dbInstanceName') ?? 'ravoxzap-pg';
const dbName = cfg.get('dbName') ?? 'ravoxzap';
const dbUserName = cfg.get('dbUserName') ?? 'ravoxzap_app';
const dbTier = cfg.get('dbTier') ?? 'db-f1-micro';
const dbDiskGb = cfg.getNumber('dbDiskGb') ?? 10;
const databasePoolMax = cfg.getNumber('databasePoolMax') ?? 3;
const dbConnectionGuardrail = cfg.getNumber('dbConnectionGuardrail') ?? 40;

const redisInstanceName = cfg.get('redisInstanceName') ?? 'ravoxzap-redis';
const redisMemoryGb = cfg.getNumber('redisMemoryGb') ?? 1;

const cloudRunMinInstances = cfg.getNumber('cloudRunMinInstances') ?? 1;
const cloudRunMaxInstances = cfg.getNumber('cloudRunMaxInstances') ?? 10;
const cloudRunConcurrency = cfg.getNumber('cloudRunConcurrency') ?? 80;
const cloudRunCpu = cfg.get('cloudRunCpu') ?? '1';
const cloudRunMemory = cfg.get('cloudRunMemory') ?? '1Gi';

const workerReplicas = cfg.getNumber('workerReplicas') ?? 2;
const workerCpu = cfg.get('workerCpu') ?? '500m';
const workerMemory = cfg.get('workerMemory') ?? '1Gi';
const workerLockTtlMs = String(cfg.getNumber('workerLockTtlMs') ?? 30000);

const apiBaseUrl = cfg.require('apiBaseUrl');
const webBaseUrl = cfg.require('webBaseUrl');
const corsOrigins = cfg.get('corsOrigins') ?? webBaseUrl;
const storageBaseUrl = cfg.require('storageBaseUrl');
const r2Endpoint = cfg.require('r2Endpoint');
const r2Region = cfg.get('r2Region') ?? 'us-east-1';
const r2Bucket = cfg.require('r2Bucket');
const mediaRetentionDays = String(cfg.getNumber('mediaRetentionDays') ?? 7);

const enableBudgetAlerts = cfg.getBoolean('enableBudgetAlerts') ?? true;
const monthlyBudgetUsd = cfg.getNumber('monthlyBudgetUsd') ?? 50;

const githubOwner = cfg.get('githubOwner');
const githubRepoName = cfg.get('githubRepoName');
const githubBranchRegex = cfg.get('githubBranchRegex') ?? '^main$';

const jwtSecret = cfg.requireSecret('jwtSecret');
const apiKeySecret = cfg.requireSecret('apiKeySecret');
const encryptionKey = cfg.requireSecret('encryptionKey');
const workerSecretValue = cfg.requireSecret('workerSecret');
const r2AccessKeyId = cfg.requireSecret('r2AccessKeyId');
const r2SecretAccessKey = cfg.requireSecret('r2SecretAccessKey');

if (cloudRunMaxInstances < cloudRunMinInstances) {
  throw new Error('cloudRunMaxInstances must be >= cloudRunMinInstances.');
}

const estimatedMaxDbConnections = cloudRunMaxInstances * databasePoolMax + workerReplicas * databasePoolMax;
if (estimatedMaxDbConnections > dbConnectionGuardrail) {
  throw new Error(`Potential DB connection saturation: Cloud Run (${cloudRunMaxInstances}) + workers (${workerReplicas}) x pool (${databasePoolMax}) = ${estimatedMaxDbConnections}, above dbConnectionGuardrail (${dbConnectionGuardrail}).`);
}

const provider = new gcp.Provider('gcp-provider', { project, region });

const requiredApis = [
  'artifactregistry.googleapis.com',
  'billingbudgets.googleapis.com',
  'cloudbuild.googleapis.com',
  'compute.googleapis.com',
  'container.googleapis.com',
  'iam.googleapis.com',
  'logging.googleapis.com',
  'monitoring.googleapis.com',
  'redis.googleapis.com',
  'run.googleapis.com',
  'secretmanager.googleapis.com',
  'servicenetworking.googleapis.com',
  'serviceusage.googleapis.com',
  'sqladmin.googleapis.com',
];

const apiServices = requiredApis.map(api => new gcp.projects.Service(api.replace(/[.:]/g, '-'), {
  project,
  service: api,
  disableOnDestroy: false,
}, { provider }));

const network = new gcp.compute.Network('ravoxzap-network', {
  name: 'ravoxzap-prod',
  autoCreateSubnetworks: false,
}, { provider, dependsOn: apiServices });

const subnet = new gcp.compute.Subnetwork('ravoxzap-subnet', {
  name: 'ravoxzap-prod-subnet',
  ipCidrRange: '10.20.0.0/20',
  region,
  network: network.id,
  privateIpGoogleAccess: true,
}, { provider });

const privateServiceRange = new gcp.compute.GlobalAddress('private-service-range', {
  name: 'ravoxzap-private-services',
  purpose: 'VPC_PEERING',
  addressType: 'INTERNAL',
  prefixLength: 16,
  network: network.id,
}, { provider });

const privateServiceConnection = new gcp.servicenetworking.Connection('private-service-connection', {
  network: network.id,
  service: 'servicenetworking.googleapis.com',
  reservedPeeringRanges: [privateServiceRange.name],
}, { provider, dependsOn: apiServices });

const router = new gcp.compute.Router('cloud-nat-router', {
  name: 'ravoxzap-nat-router',
  region,
  network: network.id,
}, { provider });

new gcp.compute.RouterNat('cloud-nat', {
  name: 'ravoxzap-nat',
  router: router.name,
  region,
  natIpAllocateOption: 'AUTO_ONLY',
  sourceSubnetworkIpRangesToNat: 'ALL_SUBNETWORKS_ALL_IP_RANGES',
}, { provider });

const artifactRepository = new gcp.artifactregistry.Repository('artifact-repository', {
  location: region,
  repositoryId: artifactRepositoryId,
  format: 'DOCKER',
  description: 'Docker repository for RavoxZap',
  cleanupPolicyDryRun: false,
  cleanupPolicies: [
    {
      id: 'delete-untagged-older-than-7d',
      action: 'DELETE',
      condition: { tagState: 'UNTAGGED', olderThan: '604800s' },
    },
    {
      id: 'keep-recent-5',
      action: 'KEEP',
      mostRecentVersions: { keepCount: 5 },
    },
  ],
}, { provider, dependsOn: apiServices });

const dbPassword = new random.RandomPassword('db-password', { length: 24, special: false });

const sqlInstance = new gcp.sql.DatabaseInstance('postgres-instance', {
  name: dbInstanceName,
  region,
  databaseVersion: 'POSTGRES_16',
  deletionProtection: true,
  settings: {
    tier: dbTier,
    edition: 'ENTERPRISE',
    availabilityType: 'ZONAL',
    diskType: 'PD_SSD',
    diskSize: dbDiskGb,
    diskAutoresize: true,
    deletionProtectionEnabled: true,
    backupConfiguration: {
      enabled: true,
      startTime: '03:00',
      pointInTimeRecoveryEnabled: true,
    },
    insightsConfig: {
      queryInsightsEnabled: true,
      queryStringLength: 1024,
      queryPlansPerMinute: 5,
    },
    ipConfiguration: {
      ipv4Enabled: false,
      privateNetwork: network.id,
    },
  },
}, { provider, dependsOn: [privateServiceConnection] });

const sqlDatabase = new gcp.sql.Database('app-database', {
  name: dbName,
  instance: sqlInstance.name,
}, { provider });

const sqlUser = new gcp.sql.User('app-user', {
  instance: sqlInstance.name,
  name: dbUserName,
  password: dbPassword.result,
}, { provider });

const redisInstance = new gcp.redis.Instance('redis-instance', {
  name: redisInstanceName,
  tier: 'STANDARD_HA',
  memorySizeGb: redisMemoryGb,
  region,
  authorizedNetwork: network.id,
  redisVersion: 'REDIS_7_0',
}, { provider, dependsOn: [privateServiceConnection] });

const runtimeServiceAccount = new gcp.serviceaccount.Account('runtime-service-account', {
  accountId: `${serviceName}`.slice(0, 24).replace(/[^a-z0-9-]/g, '-') + '-rt',
  displayName: 'RavoxZap runtime service account',
}, { provider, dependsOn: apiServices });

const workerServiceAccount = new gcp.serviceaccount.Account('worker-service-account', {
  accountId: `${workerName}`.slice(0, 24).replace(/[^a-z0-9-]/g, '-') + '-wk',
  displayName: 'RavoxZap worker service account',
}, { provider, dependsOn: apiServices });

const cloudBuildServiceAccount = new gcp.serviceaccount.Account('cloud-build-service-account', {
  accountId: `${serviceName}`.slice(0, 21).replace(/[^a-z0-9-]/g, '-') + '-cb',
  displayName: 'RavoxZap Cloud Build deploy service account',
}, { provider, dependsOn: apiServices });

function grantProjectRole(name: string, role: string, member: pulumi.Input<string>) {
  return new gcp.projects.IAMMember(name, { project, role, member }, { provider });
}

for (const [prefix, account] of [['runtime', runtimeServiceAccount], ['worker', workerServiceAccount]] as const) {
  grantProjectRole(`${prefix}-cloudsql-client`, 'roles/cloudsql.client', pulumi.interpolate`serviceAccount:${account.email}`);
  grantProjectRole(`${prefix}-secret-accessor`, 'roles/secretmanager.secretAccessor', pulumi.interpolate`serviceAccount:${account.email}`);
  grantProjectRole(`${prefix}-log-writer`, 'roles/logging.logWriter', pulumi.interpolate`serviceAccount:${account.email}`);
}

grantProjectRole('cloudbuild-run-admin', 'roles/run.admin', pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`);
grantProjectRole('cloudbuild-artifact-writer', 'roles/artifactregistry.writer', pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`);
grantProjectRole('cloudbuild-container-developer', 'roles/container.developer', pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`);
grantProjectRole('cloudbuild-log-writer', 'roles/logging.logWriter', pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`);
grantProjectRole('cloudbuild-iam-service-account-user', 'roles/iam.serviceAccountUser', pulumi.interpolate`serviceAccount:${cloudBuildServiceAccount.email}`);

function createSecret(name: string, secretId: string, value: pulumi.Input<string>) {
  const secret = new gcp.secretmanager.Secret(name, {
    secretId,
    replication: { auto: {} },
  }, { provider, dependsOn: apiServices });

  const version = new gcp.secretmanager.SecretVersion(`${name}-version`, {
    secret: secret.id,
    secretData: value,
  }, { provider });

  return { secret, version };
}

const databaseUrl = pulumi.interpolate`postgresql://${dbUserName}:${dbPassword.result}@${sqlInstance.privateIpAddress}:5432/${dbName}`;
const redisUrl = pulumi.interpolate`redis://${redisInstance.host}:${redisInstance.port}`;

const databaseUrlSecret = createSecret('database-url-secret', 'ravoxzap-database-url', databaseUrl);
const redisUrlSecret = createSecret('redis-url-secret', 'ravoxzap-redis-url', redisUrl);
const jwtSecretResource = createSecret('jwt-secret', 'ravoxzap-jwt-secret', jwtSecret);
const apiKeySecretResource = createSecret('api-key-secret', 'ravoxzap-api-key-secret', apiKeySecret);
const encryptionKeySecretResource = createSecret('encryption-key-secret', 'ravoxzap-encryption-key', encryptionKey);
const workerSecretResource = createSecret('worker-secret', 'ravoxzap-worker-secret', workerSecretValue);
const r2AccessKeyIdSecret = createSecret('r2-access-key-id-secret', 'ravoxzap-r2-access-key-id', r2AccessKeyId);
const r2SecretAccessKeySecret = createSecret('r2-secret-access-key-secret', 'ravoxzap-r2-secret-access-key', r2SecretAccessKey);

const imageBase = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${artifactRepository.repositoryId}`;
const apiImage = initialApiImageDigest
  ? pulumi.interpolate`${imageBase}/${apiImageName}@${initialApiImageDigest}`
  : pulumi.interpolate`${imageBase}/${apiImageName}:${initialImageTag}`;
const workerImage = initialWorkerImageDigest
  ? pulumi.interpolate`${imageBase}/${workerImageName}@${initialWorkerImageDigest}`
  : pulumi.interpolate`${imageBase}/${workerImageName}:${initialImageTag}`;

type RuntimeSecret = ReturnType<typeof createSecret>;
type RuntimeEnv =
  | { name: string; value: pulumi.Input<string> }
  | { name: string; secret: RuntimeSecret };

const appEnv: RuntimeEnv[] = [
  { name: 'NODE_ENV', value: 'production' },
  { name: 'PORT', value: '8080' },
  { name: 'API_BASE_URL', value: apiBaseUrl },
  { name: 'WEB_BASE_URL', value: webBaseUrl },
  { name: 'CORS_ORIGINS', value: corsOrigins },
  { name: 'DISK', value: 'r2' },
  { name: 'MEDIA_STORAGE_MODE', value: 'archive' },
  { name: 'MEDIA_RETENTION_DAYS', value: mediaRetentionDays },
  { name: 'STORAGE_BASE_URL', value: storageBaseUrl },
  { name: 'R2_ENDPOINT', value: r2Endpoint },
  { name: 'R2_REGION', value: r2Region },
  { name: 'R2_BUCKET', value: r2Bucket },
  { name: 'BAILEYS_AUTH_STORE', value: 'database' },
  { name: 'WORKER_LOCK_TTL_MS', value: workerLockTtlMs },
  { name: 'DATABASE_URL', secret: databaseUrlSecret },
  { name: 'REDIS_URL', secret: redisUrlSecret },
  { name: 'JWT_SECRET', secret: jwtSecretResource },
  { name: 'API_KEY_SECRET', secret: apiKeySecretResource },
  { name: 'ENCRYPTION_KEY', secret: encryptionKeySecretResource },
  { name: 'WORKER_SECRET', secret: workerSecretResource },
  { name: 'R2_ACCESS_KEY_ID', secret: r2AccessKeyIdSecret },
  { name: 'R2_SECRET_ACCESS_KEY', secret: r2SecretAccessKeySecret },
];

function cloudRunEnvs() {
  return appEnv.map(item => 'secret' in item
    ? {
        name: item.name,
        valueSource: {
          secretKeyRef: {
            secret: item.secret.secret.secretId,
            version: 'latest',
          },
        },
      }
    : { name: item.name, value: item.value });
}

const runService = new gcp.cloudrunv2.Service('api-service', {
  name: serviceName,
  location: region,
  ingress: 'INGRESS_TRAFFIC_ALL',
  template: {
    serviceAccount: runtimeServiceAccount.email,
    timeout: '300s',
    maxInstanceRequestConcurrency: cloudRunConcurrency,
    scaling: {
      minInstanceCount: cloudRunMinInstances,
      maxInstanceCount: cloudRunMaxInstances,
    },
    vpcAccess: {
      egress: 'PRIVATE_RANGES_ONLY',
      networkInterfaces: [{ network: network.name, subnetwork: subnet.name }],
    },
    containers: [{
      image: apiImage,
      ports: { containerPort: 8080 },
      resources: {
        cpuIdle: true,
        limits: { cpu: cloudRunCpu, memory: cloudRunMemory },
      },
      envs: cloudRunEnvs(),
    }],
  },
}, {
  provider,
  ignoreChanges: ['template.containers[0].image'],
  dependsOn: [sqlDatabase, sqlUser, redisInstance],
});

new gcp.cloudrunv2.ServiceIamMember('api-public-invoker', {
  name: runService.name,
  location: runService.location,
  role: 'roles/run.invoker',
  member: 'allUsers',
}, { provider });

const migrationJob = new gcp.cloudrunv2.Job('migration-job', {
  name: migrationJobName,
  location: region,
  template: {
    template: {
      serviceAccount: runtimeServiceAccount.email,
      timeout: '900s',
      vpcAccess: {
        egress: 'PRIVATE_RANGES_ONLY',
        networkInterfaces: [{ network: network.name, subnetwork: subnet.name }],
      },
      containers: [{
        image: apiImage,
        commands: ['yarn'],
        args: ['workspace', '@ravoxzap/database', 'db:deploy'],
        envs: cloudRunEnvs(),
      }],
    },
  },
}, {
  provider,
  ignoreChanges: ['template.template.containers[0].image'],
  dependsOn: [sqlDatabase, sqlUser],
});

const cluster = new gcp.container.Cluster('worker-cluster', {
  name: `${workerName}-cluster`,
  location: region,
  enableAutopilot: true,
  network: network.id,
  subnetwork: subnet.id,
  deletionProtection: false,
  ipAllocationPolicy: {},
}, { provider, dependsOn: apiServices });

const kubeconfig = pulumi.all([cluster.name, cluster.endpoint, cluster.masterAuth]).apply(([name, endpoint, masterAuth]: [string, string, gcp.types.output.container.ClusterMasterAuth]) => `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${name}
contexts:
- context:
    cluster: ${name}
    user: ${name}
  name: ${name}
current-context: ${name}
kind: Config
preferences: {}
users:
- name: ${name}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gke-gcloud-auth-plugin
      installHint: Install gke-gcloud-auth-plugin for kubectl auth.
      provideClusterInfo: true
`);

const k8sProvider = new k8s.Provider('gke-provider', { kubeconfig }, { dependsOn: [cluster] });

const namespace = new k8s.core.v1.Namespace('ravoxzap-namespace', {
  metadata: { name: 'ravoxzap' },
}, { provider: k8sProvider });

const workerKubernetesServiceAccount = new k8s.core.v1.ServiceAccount('worker-kubernetes-service-account', {
  metadata: {
    name: workerName,
    namespace: namespace.metadata.name,
    annotations: {
      'iam.gke.io/gcp-service-account': workerServiceAccount.email,
    },
  },
}, { provider: k8sProvider });

new gcp.serviceaccount.IAMMember('worker-workload-identity-binding', {
  serviceAccountId: workerServiceAccount.name,
  role: 'roles/iam.workloadIdentityUser',
  member: pulumi.interpolate`serviceAccount:${project}.svc.id.goog[${namespace.metadata.name}/${workerKubernetesServiceAccount.metadata.name}]`,
}, { provider });

const workerRuntimeSecret = new k8s.core.v1.Secret('worker-runtime-secret', {
  metadata: { name: 'ravoxzap-worker-runtime', namespace: namespace.metadata.name },
  stringData: {
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    JWT_SECRET: jwtSecret,
    API_KEY_SECRET: apiKeySecret,
    ENCRYPTION_KEY: encryptionKey,
    WORKER_SECRET: workerSecretValue,
    R2_ACCESS_KEY_ID: r2AccessKeyId,
    R2_SECRET_ACCESS_KEY: r2SecretAccessKey,
  },
}, { provider: k8sProvider });

new k8s.apps.v1.Deployment('worker-deployment', {
  metadata: { name: workerName, namespace: namespace.metadata.name },
  spec: {
    replicas: workerReplicas,
    selector: { matchLabels: { app: workerName } },
    template: {
      metadata: { labels: { app: workerName } },
      spec: {
        serviceAccountName: workerKubernetesServiceAccount.metadata.name,
        containers: [{
          name: 'worker',
          image: workerImage,
          imagePullPolicy: 'Always',
          resources: {
            requests: { cpu: workerCpu, memory: workerMemory },
            limits: { cpu: workerCpu, memory: workerMemory },
          },
          envFrom: [{ secretRef: { name: workerRuntimeSecret.metadata.name } }],
          env: [
            { name: 'NODE_ENV', value: 'production' },
            { name: 'API_BASE_URL', value: apiBaseUrl },
            { name: 'WEB_BASE_URL', value: webBaseUrl },
            { name: 'DISK', value: 'r2' },
            { name: 'MEDIA_STORAGE_MODE', value: 'archive' },
            { name: 'MEDIA_RETENTION_DAYS', value: mediaRetentionDays },
            { name: 'STORAGE_BASE_URL', value: storageBaseUrl },
            { name: 'R2_ENDPOINT', value: r2Endpoint },
            { name: 'R2_REGION', value: r2Region },
            { name: 'R2_BUCKET', value: r2Bucket },
            { name: 'BAILEYS_AUTH_STORE', value: 'database' },
            { name: 'WORKER_REPLICAS', value: String(workerReplicas) },
            { name: 'WORKER_LOCK_TTL_MS', value: workerLockTtlMs },
          ],
        }],
      },
    },
  },
}, { provider: k8sProvider, dependsOn: [workerRuntimeSecret, workerKubernetesServiceAccount] });

const projectInfo = gcp.organizations.getProjectOutput({ projectId: project }, { provider });
if (enableBudgetAlerts) {
  const budgetWholeUsd = Math.floor(monthlyBudgetUsd);
  const budgetNanos = Math.round((monthlyBudgetUsd - budgetWholeUsd) * 1_000_000_000);
  new gcp.billing.Budget('monthly-budget', {
    billingAccount,
    displayName: `${serviceName}-monthly-budget`,
    amount: {
      specifiedAmount: { currencyCode: 'USD', units: String(budgetWholeUsd), nanos: budgetNanos },
    },
    budgetFilter: { projects: [projectInfo.number.apply((number: string) => `projects/${number}`)] },
    thresholdRules: [
      { thresholdPercent: 0.25, spendBasis: 'CURRENT_SPEND' },
      { thresholdPercent: 0.5, spendBasis: 'CURRENT_SPEND' },
      { thresholdPercent: 0.8, spendBasis: 'CURRENT_SPEND' },
      { thresholdPercent: 1.0, spendBasis: 'CURRENT_SPEND' },
    ],
  }, { provider });
}

const sqlCpuFilter = pulumi.interpolate`resource.type="cloudsql_database" AND resource.label.database_id="${sqlInstance.connectionName}" AND metric.type="cloudsql.googleapis.com/database/cpu/utilization"`;
new gcp.monitoring.AlertPolicy('alert-policy-cloudsql-cpu-high', {
  displayName: `[${serviceName}] Cloud SQL CPU high`,
  combiner: 'OR',
  severity: 'WARNING',
  enabled: true,
  conditions: [{
    displayName: 'Cloud SQL CPU > 80%',
    conditionThreshold: {
      filter: sqlCpuFilter,
      comparison: 'COMPARISON_GT',
      thresholdValue: 0.8,
      duration: '900s',
      aggregations: [{ alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_MEAN' }],
    },
  }],
}, { provider });

new gcp.monitoring.AlertPolicy('alert-policy-cloudrun-5xx-rate', {
  displayName: `[${serviceName}] Cloud Run 5xx rate`,
  combiner: 'OR',
  severity: 'ERROR',
  enabled: true,
  conditions: [{
    displayName: 'Cloud Run 5xx responses',
    conditionThreshold: {
      filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class="5xx"`,
      comparison: 'COMPARISON_GT',
      thresholdValue: 5,
      duration: '300s',
      aggregations: [
        { alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_RATE', crossSeriesReducer: 'REDUCE_SUM' },
      ],
    },
  }],
}, { provider });

new gcp.monitoring.AlertPolicy('alert-policy-cloudrun-p95-latency', {
  displayName: `[${serviceName}] Cloud Run p95 latency`,
  combiner: 'OR',
  severity: 'WARNING',
  enabled: true,
  conditions: [{
    displayName: 'Cloud Run p95 latency > 2s',
    conditionThreshold: {
      filter: `resource.type="cloud_run_revision" AND resource.labels.service_name="${serviceName}" AND metric.type="run.googleapis.com/request_latencies"`,
      comparison: 'COMPARISON_GT',
      thresholdValue: 2000,
      duration: '300s',
      aggregations: [
        { alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_DELTA', crossSeriesReducer: 'REDUCE_PERCENTILE_95' },
      ],
    },
  }],
}, { provider });

new gcp.monitoring.AlertPolicy('alert-policy-gke-worker-restarts', {
  displayName: `[${workerName}] GKE worker restarts`,
  combiner: 'OR',
  severity: 'WARNING',
  enabled: true,
  conditions: [{
    displayName: 'Worker container restarts',
    conditionThreshold: {
      filter: `resource.type="k8s_container" AND resource.labels.namespace_name="ravoxzap" AND resource.labels.container_name="worker" AND metric.type="kubernetes.io/container/restart_count"`,
      comparison: 'COMPARISON_GT',
      thresholdValue: 2,
      duration: '600s',
      aggregations: [
        { alignmentPeriod: '300s', perSeriesAligner: 'ALIGN_DELTA', crossSeriesReducer: 'REDUCE_SUM' },
      ],
    },
  }],
}, { provider });

if (githubOwner && githubRepoName) {
  new gcp.cloudbuild.Trigger('main-branch-trigger', {
    name: `${serviceName}-main`,
    description: `Deploy ${serviceName} and ${workerName} from main branch`,
    filename: 'cloudbuild.yaml',
    serviceAccount: pulumi.interpolate`projects/${project}/serviceAccounts/${cloudBuildServiceAccount.email}`,
    github: {
      owner: githubOwner,
      name: githubRepoName,
      push: { branch: githubBranchRegex },
    },
    substitutions: {
      _REGION: region,
      _REPOSITORY: artifactRepository.repositoryId,
      _API_IMAGE_NAME: apiImageName,
      _WORKER_IMAGE_NAME: workerImageName,
      _SERVICE_NAME: serviceName,
      _MIGRATION_JOB_NAME: migrationJob.name,
      _GKE_CLUSTER: cluster.name,
      _GKE_LOCATION: region,
      _K8S_NAMESPACE: namespace.metadata.name,
      _WORKER_DEPLOYMENT: workerName,
    },
  }, { provider });
}

export const gcpProject = project;
export const gcpRegion = region;
export const cloudRunServiceName = runService.name;
export const cloudRunServiceUrl = runService.uri;
export { apiBaseUrl };
export const cloudSqlInstanceName = sqlInstance.name;
export const redisHost = redisInstance.host;
export const gkeClusterName = cluster.name;
export const workerNamespace = namespace.metadata.name;
export const artifactRegistryRepository = artifactRepository.repositoryId;
export const apiDockerImageBase = pulumi.interpolate`${imageBase}/${apiImageName}`;
export const workerDockerImageBase = pulumi.interpolate`${imageBase}/${workerImageName}`;
export const migrationJobCreated = migrationJob.name;
export const estimatedMaxAppDbConnections = estimatedMaxDbConnections;
export const cloudBuildMainTriggerEnabled = Boolean(githubOwner && githubRepoName);
