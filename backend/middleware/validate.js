import AppError from '../utils/AppError.js'

// Validates req.body against a zod schema and replaces it with the parsed
// (type-coerced, unknown-keys-stripped) value.
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {})
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join(', ')
    return next(new AppError(message, 400))
  }
  req.body = result.data
  next()
}

export default validate
