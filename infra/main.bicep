@description('Short environment identifier used in resource names.')
@minLength(2)
@maxLength(12)
param environmentName string = 'dev'

@description('Azure region. Confirm Flex Consumption availability before deployment.')
param location string = resourceGroup().location

@description('Maximum scale-out instance count.')
@minValue(1)
@maxValue(1000)
param maximumInstanceCount int = 20

@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048

@description('Application (client) ID of the Entra app registration protecting the API.')
param entraApiClientId string

param tags object = {
  application: 'facturas-copilot'
  environment: environmentName
  managedBy: 'bicep'
}

var token = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))
var storageName = take('stfact${environmentName}${token}', 24)
var functionName = take('func-facturas-copilot-${environmentName}-${token}', 60)
var planName = 'plan-facturas-copilot-${environmentName}'
var insightsName = 'appi-facturas-copilot-${environmentName}'
var workspaceName = 'log-facturas-copilot-${environmentName}'
var vaultName = take('kv-fact-${environmentName}-${token}', 24)
var deploymentContainerName = 'app-package-${take(token, 12)}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: { publicAccess: 'None' }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: true
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: functionName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      runtime: { name: 'node', version: '24' }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
    }
    siteConfig: {
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__blobServiceUri', value: storage.properties.primaryEndpoints.blob }
        { name: 'AzureWebJobsStorage__queueServiceUri', value: storage.properties.primaryEndpoints.queue }
        { name: 'AzureWebJobsStorage__tableServiceUri', value: storage.properties.primaryEndpoints.table }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'Authorization=AAD' }
        { name: 'FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR', value: 'true' }
        { name: 'BANK_IMPORT_SCHEDULE', value: '0 */10 * * * *' }
        { name: 'M365_BANK_FOLDER', value: 'ExtractosBancarios' }
        { name: 'M365_BANK_PROCESSED_FOLDER', value: 'Procesados' }
        { name: 'M365_BANK_ERROR_FOLDER', value: 'Errores' }
        { name: 'M365_BANK_IMPORTS_LIST', value: 'ImportacionesBancarias' }
        { name: 'M365_BANK_MOVEMENTS_LIST', value: 'MovimientosBancarios' }
        { name: 'M365_EXCEPTIONS_LIST', value: 'Excepciones' }
        { name: 'INVOICE_MAIL_POLL_SCHEDULE', value: '30 */10 * * * *' }
        { name: 'M365_INVOICE_FOLDER', value: 'Facturas' }
      ]
    }
  }
}

resource functionAuth 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true, runtimeVersion: '~1' }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'Return401'
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: entraApiClientId
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            'api://${entraApiClientId}'
            entraApiClientId
            'https://${functionApp.properties.defaultHostName}'
          ]
        }
      }
    }
    login: { tokenStore: { enabled: false } }
    httpSettings: {
      requireHttps: true
      routes: { apiPrefix: '/.auth' }
      forwardProxy: { convention: 'NoProxy' }
    }
  }
}

var storageBlobDataOwner = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b')
var storageQueueDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '974c5e8b-45b9-4653-ba55-5f855dd0fb88')
var storageTableDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
var monitoringMetricsPublisher = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')
var keyVaultSecretsUser = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageBlobDataOwner)
  scope: storage
  properties: { roleDefinitionId: storageBlobDataOwner, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

resource queueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageQueueDataContributor)
  scope: storage
  properties: { roleDefinitionId: storageQueueDataContributor, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

resource tableRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionApp.id, storageTableDataContributor)
  scope: storage
  properties: { roleDefinitionId: storageTableDataContributor, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

resource metricsRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(insights.id, functionApp.id, monitoringMetricsPublisher)
  scope: insights
  properties: { roleDefinitionId: monitoringMetricsPublisher, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

resource vaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, functionApp.id, keyVaultSecretsUser)
  scope: vault
  properties: { roleDefinitionId: keyVaultSecretsUser, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionPrincipalId string = functionApp.identity.principalId
output storageAccountName string = storage.name
output keyVaultName string = vault.name
