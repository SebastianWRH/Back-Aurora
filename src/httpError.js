class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

const createHttpError = (status, message, details) => new HttpError(status, message, details);

module.exports = {
  HttpError,
  createHttpError
};
