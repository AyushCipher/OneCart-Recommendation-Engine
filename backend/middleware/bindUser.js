import AppError from '../utils/AppError.js'

// Must run after isAuth. Overwrites any client-supplied userId in the body so
// handlers that read req.body.userId always act on the authenticated user.
export const bindUserId = (req, res, next) => {
  req.body = { ...(req.body || {}), userId: req.userId.toString() }
  next()
}

// For routes with a :userId param: callers may only read their own data.
export const selfOnly = (req, res, next) => {
  if (req.params.userId !== req.userId.toString()) {
    return next(new AppError('Forbidden', 403))
  }
  next()
}
