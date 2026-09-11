@description('Short environment identifier used in resource names.')
@minLength(2)
@maxLength(12)
param environmentName string = 'dev'

@description('Azure region. Confirm Flex Consumption availability before deployment.')
param location string = resourceGroup().location

@description('Azure region for Document Intelligence. The service is not available in Spain Central; availability for new customers can vary.')
param documentIntelligenceLocation string = 'northeurope'

@description('Maximum scale-out instance count.')
@minValue(1)
@maxValue(1000)
param maximumInstanceCount int = 20

@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048

@description('Application (client) ID of the Entra app registration protecting the API.')
param entraApiClientId string

@description('SMTP address of the scoped invoice mailbox. This is an identifier, not a secret.')
param m365MailboxAddress string = 'facturas-pruebas@integramente.onmicrosoft.com'

@description('Microsoft Graph composite ID of the SharePoint site. This is an identifier, not a secret.')
param m365SharePointSiteId string = 'integramente.sharepoint.com,22c53ae6-a4db-491e-85b0-e976c559c890,c7b7b19b-73af-42e3-8b2b-67f7036ded5b'

@description('Microsoft Graph ID of the default SharePoint document library. This is an identifier, not a secret.')
param m365SharePointDriveId string = 'b!5jrFItukHkmFsOl2xVnIkJuxt8evc-NCiytn9wNt7VsGAUobTrWkQLJNsSY1Ct6p'

@description('Safety switch for automatic mailbox processing. Enable only after persistent lists are provisioned and the pilot inbox is prepared.')
param invoiceProcessingEnabled bool = false

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
var documentIntelligenceName = take('di-fact-${environmentName}-${token}', 64)

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

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: documentIntelligenceName
  location: documentIntelligenceLocation
  tags: tags
  kind: 'FormRecognizer'
  sku: { name: 'F0' }
  properties: {
    customSubDomainName: documentIntelligenceName
    disableLocalAuth: true
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
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
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
        { name: 'M365_SUPPLIERS_LIST', value: 'MaestroProveedores' }
        { name: 'M365_INVOICE_PROCESSES_LIST', value: 'ProcesosFacturas' }
        { name: 'M365_INVOICE_REGISTRY_LIST', value: 'RegistroFacturas' }
        { name: 'INVOICE_PROCESSING_ENABLED', value: string(invoiceProcessingEnabled) }
        { name: 'INVOICE_MAIL_POLL_SCHEDULE', value: '30 */10 * * * *' }
        { name: 'M365_INVOICE_FOLDER', value: 'Facturas' }
        { name: 'M365_MAILBOX_ADDRESS', value: m365MailboxAddress }
        { name: 'M365_SHAREPOINT_SITE_ID', value: m365SharePointSiteId }
        { name: 'M365_SHAREPOINT_DRIVE_ID', value: m365SharePointDriveId }
        { name: 'DOCUMENT_INTELLIGENCE_ENDPOINT', value: documentIntelligence.properties.endpoint }
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
// Cognitive Services User currently lacks the Document Intelligence v4 analyze data action in this tenant.
var cognitiveServicesDataContributor = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '19c28022-e58e-450d-a464-0b2a53034789')

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

resource documentIntelligenceRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligence.id, functionApp.id, cognitiveServicesDataContributor)
  scope: documentIntelligence
  properties: { roleDefinitionId: cognitiveServicesDataContributor, principalId: functionApp.identity.principalId, principalType: 'ServicePrincipal' }
}

output functionAppName string = functionApp.name
output functionAppUrl string = 'https://${functionApp.properties.defaultHostName}'
output functionPrincipalId string = functionApp.identity.principalId
output storageAccountName string = storage.name
output keyVaultName string = vault.name
output documentIntelligenceName string = documentIntelligence.name
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
