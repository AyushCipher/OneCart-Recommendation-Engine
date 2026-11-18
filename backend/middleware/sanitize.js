import mongoSanitize from 'express-mongo-sanitize'

// express-mongo-sanitize's own middleware assigns to req.query, which is a
// read-only getter in Express 5, so we call its sanitize() helper directly.
// It mutates objects in place, removing keys that start with "$" or contain ".".
const sanitizeInput = (req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body)
  if (req.params) mongoSanitize.sanitize(req.params)
  if (req.query) mongoSanitize.sanitize(req.query)
  next()
}

export default sanitizeInput
