// REF: boss-hq/worker/src/services/invoiceService.ts — invoice-first delivery side-effects + error wrapping
// REF: boss-hq/worker/src/routes/documents.ts — R2 file upload and temporary download URL pattern

import Papa from "papaparse";
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

import {
  createDeliveryBatchRecord,
  createInvoiceRecord,
  getCampaignById,
  getClientById,
  incrementCampaignDeliveredCount,
  markLeadsDelivered,
  updateDeliveryBatch,
  type Lead,
} from "../db/queries/index";
import { createOpsQueueEntry } from "../db/queries/index";
import { DeliveryError } from "./errors";

export interface DeliveryBatch {
  batch_id: string;
  campaign_id: string;
  tenant_id: string;
  lead_count: number;
  file_url?: string;
  delivery_status: "pending" | "sent" | "failed";
  created_at: number;
  updated_at: number;
}

export interface DeliveryFile {
  batch_id: string;
  file_key: string;
  file_type: "csv" | "xlsx";
  row_count: number;
}

function asCsvRows(leads: Lead[]): Array<Record<string, string | number | null>> {
  return leads.map((lead) => ({
    email: lead.email,
    first_name: lead.first_name,
    last_name: lead.last_name,
    company: lead.company,
    title: lead.title,
    icp_score: lead.icp_score ?? 0,
    country: lead.country,
  }));
}

async function createSignedUrl(r2: R2Bucket, key: string): Promise<string> {
  const candidate = r2 as unknown as {
    createPresignedUrl?: (path: string, options?: { expiresIn?: number; method?: string }) => Promise<string | URL>;
  };
  if (candidate.createPresignedUrl) {
    const signed = await candidate.createPresignedUrl(key, { expiresIn: 60 * 60 * 24, method: "GET" });
    return typeof signed === "string" ? signed : signed.toString();
  }
  return `https://r2.local/${encodeURIComponent(key)}?ttl=86400`;
}

export async function createDeliveryBatch(
  campaignId: string,
  tenantId: string,
  leads: Lead[],
  options: {
    db: D1Database;
    r2: R2Bucket;
  },
): Promise<DeliveryBatch> {
  if (!leads.length) {
    throw new DeliveryError("DELIVERY_EMPTY", "Cannot create delivery batch with zero leads");
  }

  const campaign = await getCampaignById(options.db, tenantId, campaignId);
  if (!campaign) {
    throw new DeliveryError("CAMPAIGN_NOT_FOUND", "Campaign not found for tenant");
  }

  const timestamp = Date.now();
  const fileKey = `campaigns/${campaignId}/delivery-${crypto.randomUUID()}-${timestamp}.csv`;
  const batch = await createDeliveryBatchRecord(options.db, tenantId, {
    campaign_id: campaignId,
    lead_count: leads.length,
    r2_key: fileKey,
  });

  try {
    const csvPayload = Papa.unparse(asCsvRows(leads));
    await options.r2.put(fileKey, csvPayload, {
      httpMetadata: {
        contentType: "text/csv",
      },
    });

    const fileUrl = await createSignedUrl(options.r2, fileKey);

    let invoiceId: string | null = null;
    const client = await getClientById(options.db, tenantId, campaign.client_id);
    if (client && client.type !== "aggregator") {
      const subtotal = leads.length * campaign.cpl;
      const invoice = await createInvoiceRecord(options.db, tenantId, {
        client_id: client.client_id,
        line_items: JSON.stringify([
          {
            label: `Lead delivery (${campaign.name})`,
            quantity: leads.length,
            unit_price: campaign.cpl,
            subtotal,
          },
        ]),
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        total: subtotal,
        status: "draft",
        due_date: Date.now() + client.payment_terms * 24 * 60 * 60 * 1000,
      });
      invoiceId = invoice.invoice_id;
    }

    await updateDeliveryBatch(options.db, tenantId, batch.batch_id, {
      r2_key: fileKey,
      invoice_id: invoiceId,
      delivery_status: "pending",
    });
    await incrementCampaignDeliveredCount(options.db, tenantId, campaignId, leads.length);
    await markLeadsDelivered(
      options.db,
      tenantId,
      campaignId,
      leads.map((lead) => lead.lead_id),
      batch.batch_id,
    );

    return {
      batch_id: batch.batch_id,
      campaign_id: campaignId,
      tenant_id: tenantId,
      lead_count: leads.length,
      file_url: fileUrl,
      delivery_status: "pending",
      created_at: batch.created_at,
      updated_at: Date.now(),
    };
  } catch (error) {
    await updateDeliveryBatch(options.db, tenantId, batch.batch_id, { delivery_status: "failed" });
    await createOpsQueueEntry(options.db, tenantId, {
      lead_id: null,
      task_type: "delivery_failure",
      priority: "high",
      description: `Delivery batch ${batch.batch_id} failed: ${error instanceof Error ? error.message : String(error)}`,
      assigned_to: null,
      status: "open",
      resolution: null,
      resolved_at: null,
      sla_deadline: Date.now() + 4 * 60 * 60 * 1000,
      updated_at: Date.now(),
    });
    throw new DeliveryError("DELIVERY_CREATE_FAILED", "Failed to create delivery batch", {
      batch_id: batch.batch_id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
