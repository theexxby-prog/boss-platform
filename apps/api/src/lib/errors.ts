// REF: boss-hq/worker/src/services/integrationService.ts — typed error class pattern

export class ServiceError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, status = 500, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class IntegrationClientError extends ServiceError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super("INTEGRATION_CLIENT_ERROR", `${service}: ${message}`, 502, details);
  }
}
