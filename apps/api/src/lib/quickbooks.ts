import { ServiceError } from "./errors";

export interface QuickBooksInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface QuickBooksInvoiceInput {
  customerRef: string;
  lineItems: QuickBooksInvoiceLineItem[];
  dueDateUnixMs: number;
}

export interface QuickBooksInvoiceResult {
  id: string;
  docNumber?: string;
}

export async function createQuickBooksInvoice(
  _input: QuickBooksInvoiceInput,
): Promise<QuickBooksInvoiceResult> {
  throw new ServiceError("NOT_IMPLEMENTED", "QuickBooks wrapper is scaffolded but not implemented", 501);
}
