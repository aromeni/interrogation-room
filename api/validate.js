export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
  }
}

export function parsePort(raw) {
  if (raw === undefined || raw === "") return 3000;
  if (!/^\d+$/.test(raw.trim())) {
    throw new ValidationError(`PORT must be a number, got "${raw}".`);
  }
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new ValidationError(`PORT must be between 1 and 65535, got ${port}.`);
  }
  return port;
}
