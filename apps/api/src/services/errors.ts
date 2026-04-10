// REF: boss-hq/worker/src/services/integrationService.ts — typed error class pattern
import { ServiceError } from "../lib/errors";

export class ScoringError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "ScoringError";
  }
}

export class ValidationError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 422, details);
    this.name = "ValidationError";
  }
}

export class BantQualificationError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "BantQualificationError";
  }
}

export class QueryError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "QueryError";
  }
}

export class EnrichmentError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 502, details);
    this.name = "EnrichmentError";
  }
}

export class ProcessingError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "ProcessingError";
  }
}

export class DeliveryError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "DeliveryError";
  }
}

export class DomainRotationError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 500, details);
    this.name = "DomainRotationError";
  }
}

export class WebhookError extends ServiceError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, 401, details);
    this.name = "WebhookError";
  }
}
