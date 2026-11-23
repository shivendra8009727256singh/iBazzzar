/** An expected, customer-facing failure. `status` is the HTTP status the API should return. */
export class DomainError extends Error {
  constructor(message, status = 400, fields = undefined) {
    super(message);
    this.name = 'DomainError';
    this.status = status;
    if (fields) this.fields = fields;
  }
}
