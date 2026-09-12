import type { InvoiceRegistry, ProcessRecord, ProcessStore } from "../processing/types.ts";
import type { ValidatedInvoice } from "../invoices/index.ts";
import { GraphError, type GraphClient } from "./graph-client.ts";

type ListInfo = { value: Array<{ id: string; displayName: string }> };
type ListItem = { id: string; fields?: Record<string, unknown> };

function graphPath(value: string): string { return encodeURIComponent(value); }
function string(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function json<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

class SharePointLists {
  private readonly ids = new Map<string, string>();
  protected readonly graph: GraphClient;
  protected readonly siteId: string;
  constructor(graph: GraphClient, siteId: string) { this.graph = graph; this.siteId = siteId; }

  protected async listId(name: string): Promise<string> {
    const cached = this.ids.get(name);
    if (cached) return cached;
    const lists = await this.graph.request<ListInfo>(`/sites/${graphPath(this.siteId)}/lists?$select=id,displayName`);
    const list = lists.value.find(({ displayName }) => displayName === name);
    if (!list) throw new Error(`SharePoint list '${name}' was not found`);
    this.ids.set(name, list.id);
    return list.id;
  }

  protected async find(listName: string, field: string, value: string): Promise<ListItem | undefined> {
    const listId = await this.listId(listName);
    const escaped = value.replace(/'/g, "''");
    const path = `/sites/${graphPath(this.siteId)}/lists/${graphPath(listId)}/items?$expand=fields&$filter=fields/${field} eq '${escaped}'&$top=2`;
    return (await this.graph.request<{ value: ListItem[] }>(path, { headers: { Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } })).value[0];
  }

  protected async create(listName: string, fields: Record<string, unknown>): Promise<ListItem> {
    const listId = await this.listId(listName);
    return this.graph.request<ListItem>(`/sites/${graphPath(this.siteId)}/lists/${graphPath(listId)}/items`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fields }),
    });
  }

  protected async update(listName: string, itemId: string, fields: Record<string, unknown>): Promise<void> {
    const listId = await this.listId(listName);
    await this.graph.request(`/sites/${graphPath(this.siteId)}/lists/${graphPath(listId)}/items/${graphPath(itemId)}/fields`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(fields),
    });
  }
}

export class SharePointProcessStore extends SharePointLists implements ProcessStore {
  private readonly itemIds = new Map<string, string>();
  private readonly processesList: string;
  private readonly exceptionsList: string;
  constructor(graph: GraphClient, siteId: string, processesList = "ProcesosFacturas", exceptionsList = "Excepciones") {
    super(graph, siteId); this.processesList = processesList; this.exceptionsList = exceptionsList;
  }

  async get(processId: string): Promise<ProcessRecord | undefined> {
    const item = await this.find(this.processesList, "ProcessId", processId);
    if (!item?.fields) return undefined;
    this.itemIds.set(processId, item.id);
    const fields = item.fields;
    const exceptionCode = string(fields.ExceptionCode);
    return {
      processId,
      state: string(fields.Estado) as ProcessRecord["state"],
      input: {
        messageId: string(fields.MessageId) ?? "",
        attachmentId: string(fields.AttachmentId) ?? "",
        sender: string(fields.Remitente) ?? "",
        receivedAt: string(fields.Recibido) ?? "",
        originalFilename: string(fields.ArchivoOriginal) ?? "",
        contentType: string(fields.ContentType) ?? "application/pdf",
      },
      ...(string(fields.DocumentKind) ? { documentKind: string(fields.DocumentKind) as ProcessRecord["documentKind"] } : {}),
      ...(typeof fields.ClassificationConfidence === "number" ? { classificationConfidence: fields.ClassificationConfidence } : {}),
      ...(string(fields.ClassificationReasons) ? { classificationReasons: json(fields.ClassificationReasons, []) } : {}),
      ...(string(fields.DuplicateKey) ? { duplicateKey: string(fields.DuplicateKey) } : {}),
      ...(string(fields.FinalFilename) ? { finalFilename: string(fields.FinalFilename) } : {}),
      ...(string(fields.DocumentUrl) ? { documentUrl: string(fields.DocumentUrl) } : {}),
      ...(exceptionCode ? { exception: {
        code: exceptionCode as NonNullable<ProcessRecord["exception"]>["code"],
        reason: string(fields.ExceptionReason) ?? "",
        retryable: fields.ExceptionRetryable === true,
        ...(string(fields.ValidationIssues) ? { issues: json(fields.ValidationIssues, []) } : {}),
      } } : {}),
      updatedAt: string(fields.UpdatedAt) ?? new Date(0).toISOString(),
    };
  }

  async save(record: ProcessRecord): Promise<void> {
    const fields = this.fields(record);
    let itemId = this.itemIds.get(record.processId);
    if (!itemId) {
      const existing = await this.find(this.processesList, "ProcessId", record.processId);
      itemId = existing?.id;
    }
    if (itemId) await this.update(this.processesList, itemId, fields);
    else {
      try {
        const created = await this.create(this.processesList, fields);
        this.itemIds.set(record.processId, created.id);
      } catch (error) {
        if (!(error instanceof GraphError) || error.status !== 409) throw error;
        const concurrent = await this.find(this.processesList, "ProcessId", record.processId);
        if (!concurrent) throw error;
        this.itemIds.set(record.processId, concurrent.id);
        await this.update(this.processesList, concurrent.id, fields);
      }
    }
    if (record.exception && !(await this.find(this.exceptionsList, "CorrelationId", record.processId))) {
      await this.create(this.exceptionsList, {
        Title: record.processId, Codigo: record.exception.code, EntidadTipo: "Factura", EntidadId: record.processId,
        Estado: "Abierta", Motivo: record.exception.reason.slice(0, 63_000), Reintentable: record.exception.retryable,
        CorrelationId: record.processId, FechaDeteccion: record.updatedAt,
      });
    }
  }

  private fields(record: ProcessRecord): Record<string, unknown> {
    const fields: Record<string, unknown> = {
      Title: record.processId, ProcessId: record.processId, Estado: record.state,
      MessageId: record.input.messageId, AttachmentId: record.input.attachmentId, Remitente: record.input.sender,
      Recibido: record.input.receivedAt, ArchivoOriginal: record.input.originalFilename, ContentType: record.input.contentType,
      ClassificationReasons: JSON.stringify(record.classificationReasons ?? []), DuplicateKey: record.duplicateKey ?? "",
      FinalFilename: record.finalFilename ?? "", DocumentUrl: record.documentUrl ?? "",
      ExceptionCode: record.exception?.code ?? "", ExceptionReason: record.exception?.reason ?? "",
      ExceptionRetryable: record.exception?.retryable ?? false, ValidationIssues: JSON.stringify(record.exception?.issues ?? []),
      UpdatedAt: record.updatedAt,
    };
    if (record.documentKind !== undefined) fields.DocumentKind = record.documentKind;
    if (record.classificationConfidence !== undefined) fields.ClassificationConfidence = record.classificationConfidence;
    return fields;
  }
}

export class SharePointInvoiceRegistry extends SharePointLists implements InvoiceRegistry {
  private readonly invoicesList: string;
  constructor(graph: GraphClient, siteId: string, invoicesList = "RegistroFacturas") { super(graph, siteId); this.invoicesList = invoicesList; }

  async findByDuplicateKey(key: string): Promise<{ processId: string } | undefined> {
    const item = await this.find(this.invoicesList, "DuplicateKey", key);
    const processId = item?.fields && string(item.fields.ProcessId);
    return processId ? { processId } : undefined;
  }

  async putOnce(input: { processId: string; invoice: ValidatedInvoice; duplicateKey: string; documentUrl: string; metadata: ProcessRecord["input"] }): Promise<void> {
    if (await this.find(this.invoicesList, "ProcessId", input.processId)) return;
    try {
      const fields: Record<string, unknown> = {
        Title: input.invoice.invoiceNumber, ProcessId: input.processId, DuplicateKey: input.duplicateKey,
        Proveedor: input.invoice.supplierName, NIFProveedor: input.invoice.supplierTaxId ?? "",
        NumeroFactura: input.invoice.invoiceNumber, FechaFactura: input.invoice.invoiceDate,
        BaseImponible: Number(input.invoice.taxableBase), IVA: Number(input.invoice.vatAmount), Total: Number(input.invoice.totalAmount),
        Moneda: input.invoice.currency ?? "",
        DocumentoUrl: input.documentUrl, Remitente: input.metadata.sender, Recibido: input.metadata.receivedAt,
      };
      if (input.invoice.dueDate) fields.FechaVencimiento = input.invoice.dueDate;
      await this.create(this.invoicesList, fields);
    } catch (error) {
      if (!(error instanceof GraphError) || error.status !== 409) throw error;
    }
  }
}
