// SemaBI — one-tenant-per-bank Azure deployment (Microsoft-centric estate).
// App Service (Linux) + Azure PostgreSQL Flexible Server + Azure Cache for Redis
// + Key Vault + Log Analytics/App Insights. Deploy per bank tenant:
//   az deployment group create -g rg-semabi-<bank> -f infra/main.bicep -p bankSlug=<bank> environment=prod
@description('Bank slug, e.g. "firstmeridian" — used to isolate resources per tenant.')
param bankSlug string
@description('Azure region, e.g. westeurope (Nigeria-facing estates often use EU regions for data residency).')
param location string = resourceGroup().location
@allowed(['dev', 'prod'])
param environment string = 'prod'

var suffix = '${bankSlug}-${environment}'
var appName = 'semabi-app-${suffix}'
var dbName = 'semabi-db-${suffix}'
var kvName = take('semabi-kv-${suffix}', 24)
var redisName = 'semabi-redis-${suffix}'
var logName = 'semabi-log-${suffix}'

resource log 'Microsoft.Insights/components@2020-02-02' = {
  name: logName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 90
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
  }
}

resource db 'Microsoft.DBforPostgreSQL/flexibleServers@2023-03-01-preview' = {
  name: dbName
  location: location
  sku: { name: 'Standard_B2ms', tier: 'Burstable' }
  properties: {
    administratorLogin: 'semabiadmin'
    administratorLoginPassword: kvSecretDbPassword.value  // stored in KV; injected at deploy time
    version: '16'
    storage: { storageSizeGB: 64 }
    backup: { backupRetentionDays: 35, geoRedundantBackup: 'Enabled' }
    highAvailability: { mode: environment == 'prod' ? 'ZoneRedundant' : 'Disabled' }
  }
}

resource dbFirewall 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-03-01-preview' = {
  parent: db
  name: 'allow-app-service'
  properties: {
    startIpAddress: '0.0.0.0' // tightened to App Service outbound IPs in hardening pass (M5)
    endIpAddress: '0.0.0.0'
  }
}

resource dbName_ 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-03-01-preview' = {
  parent: db
  name: 'semabi'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: redisName
  location: location
  properties: {
    sku: { name: 'Basic', family: 'C', capacity: 1 }
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'semabi-plan-${suffix}'
  location: location
  sku: { name: environment == 'prod' ? 'P1v3' : 'B1', tier: 'PremiumV3' }
  kind: 'linux'
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|semabi.azurecr.io/semabi:latest'
      alwaysOn: true
      appSettings: [
        { name: 'SEMABI_MODE', value: 'prod' }
        { name: 'DATABASE_URL', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/db-url/)' }
        { name: 'REDIS_URL', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/redis-url/)' }
        { name: 'INGEST_SCHEDULE', value: '05:30' }
        { name: 'DIGEST_SCHEDULE', value: '07:00' }
        { name: 'AGGREGATE_RETENTION_MONTHS', value: '24' }
        { name: 'AZURE_AD_CLIENT_ID', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/azure-ad-client-id/)' }
        { name: 'AZURE_AD_CLIENT_SECRET', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/azure-ad-client-secret/)' }
        { name: 'AZURE_AD_TENANT_ID', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/azure-ad-tenant-id/)' }
        { name: 'MISTRAL_API_KEY', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/mistral-api-key/)' }
        { name: 'RESEND_API_KEY', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/resend-api-key/)' }
        { name: 'TEAMS_WEBHOOK_URL', value: '@Microsoft.KeyVault(SecretUri=${kv.properties.vaultUri}secrets/teams-webhook/)') }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY', value: log.properties.InstrumentationKey }
        { name: 'WEBSITE_HTTPLOGGING_RETENTION_DAYS', value: '30' }
      ]
    }
  }
}

// Helper secret resource placeholder (real values set via `az keyvault secret set` during onboarding).
resource kvSecretDbPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: kv
  name: 'db-admin-password'
  properties: { value: 'REPLACE-VIA-KEYVAULT-ONBOARDING' }
}

output appUrl string = 'https://${app.properties.defaultHostName}'
output keyVaultName string = kv.name
output appServiceName string = app.name
