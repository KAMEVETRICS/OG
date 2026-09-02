export class CertificationRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class CertificationStorageError extends Error {
  readonly status = 503;
  readonly code = 'service_unavailable';

  constructor(message: string) {
    super(message);
  }
}
