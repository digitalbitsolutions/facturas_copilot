export type Microsoft365Config = {
  tenantId: string;
  clientId: string;
  sharePointSiteUrl: string;
  sharePointDriveId: string;
  invoiceFolder: string;
  bankFolder: string;
  mailboxAddress: string;
  mailFolder: string;
  excelFilePath: string;
  excelTable: string;
  bankBatchTable: string;
  bankMovementTable: string;
  reconciliationTable: string;
  aiBuilderModelId: string;
};

const VARIABLES = {
  tenantId: "M365_TENANT_ID", clientId: "M365_CLIENT_ID", sharePointSiteUrl: "M365_SHAREPOINT_SITE_URL",
  sharePointDriveId: "M365_SHAREPOINT_DRIVE_ID", invoiceFolder: "M365_INVOICE_FOLDER",
  bankFolder: "M365_BANK_FOLDER",
  mailboxAddress: "M365_MAILBOX_ADDRESS", mailFolder: "M365_MAIL_FOLDER",
  excelFilePath: "M365_EXCEL_FILE_PATH", excelTable: "M365_EXCEL_TABLE",
  bankBatchTable: "M365_BANK_BATCH_TABLE", bankMovementTable: "M365_BANK_MOVEMENT_TABLE",
  reconciliationTable: "M365_RECONCILIATION_TABLE", aiBuilderModelId: "M365_AI_BUILDER_MODEL_ID",
} as const;

export class ConfigurationError extends Error {
  readonly missingVariables: string[];
  constructor(missingVariables: string[]) {
    super(`Missing Microsoft 365 configuration: ${missingVariables.join(", ")}`);
    this.name = "ConfigurationError";
    this.missingVariables = missingVariables;
  }
}

export function loadMicrosoft365Config(environment: Record<string, string | undefined> = process.env): Microsoft365Config {
  const missing = Object.values(VARIABLES).filter((name) => !environment[name]?.trim());
  if (missing.length) throw new ConfigurationError(missing);
  const config = Object.fromEntries(Object.entries(VARIABLES).map(([key, name]) => [key, environment[name]!.trim()])) as Microsoft365Config;
  const url = new URL(config.sharePointSiteUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".sharepoint.com")) throw new Error("M365_SHAREPOINT_SITE_URL must be an HTTPS SharePoint Online site URL");
  if (!/^https:\/\/[^/]+\.sharepoint\.com\/sites\/[^/]+\/?$/i.test(config.sharePointSiteUrl)) throw new Error("M365_SHAREPOINT_SITE_URL must identify a site, without a library or page path");
  return config;
}
