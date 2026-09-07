import { ConfigurationError, loadMicrosoft365Config } from "../src/microsoft365/index.ts";

try {
  const config = loadMicrosoft365Config();
  console.log(JSON.stringify({
    ready: true,
    tenantIdConfigured: Boolean(config.tenantId),
    clientIdConfigured: Boolean(config.clientId),
    site: config.sharePointSiteUrl,
    mailbox: config.mailboxAddress,
    invoiceFolder: config.invoiceFolder,
    excelFile: config.excelFilePath,
    excelTable: config.excelTable,
    aiBuilderModelConfigured: Boolean(config.aiBuilderModelId),
  }, null, 2));
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error(JSON.stringify({ ready: false, missing: error.missingVariables }, null, 2));
    process.exitCode = 1;
  } else throw error;
}
