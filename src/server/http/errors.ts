/** Errores HTTP de la API (docs/07 §1). */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function validationError(
  message: string,
  details?: Array<{ field: string; issue: string }>,
): HttpError {
  return new HttpError(400, "VALIDATION_ERROR", message, details);
}

export function notFound(message = "Recurso no encontrado"): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflict(message: string, details?: unknown): HttpError {
  return new HttpError(409, "CONFLICT", message, details);
}

export function payloadTooLarge(message = "Archivo demasiado grande"): HttpError {
  return new HttpError(413, "PAYLOAD_TOO_LARGE", message);
}

export function unsupportedMedia(message = "Tipo de archivo no soportado"): HttpError {
  return new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", message);
}

export function errorJson(err: HttpError) {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    },
  };
}
