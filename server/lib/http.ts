import type { Request, Response, NextFunction, RequestHandler } from 'express'

export const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next)
  }

export const ok = (res: Response, data: any = {}) => res.json({ ok: true, ...data })

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const badRequest = (msg: string): never => {
  throw new HttpError(400, msg)
}

export const notFound = (msg: string): never => {
  throw new HttpError(404, msg)
}

export function errorMiddleware(err: any, _req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500
  if (status >= 500) console.error('[api error]', err)
  res.status(status).json({ ok: false, message: err?.message ?? '服务器内部错误' })
}

/** 取字符串字段，带默认值 */
export const str = (v: any, fallback = ''): string => (typeof v === 'string' ? v : fallback)
export const num = (v: any, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? fallback : n
}
export const bool = (v: any, fallback = false): boolean => {
  if (typeof v === 'boolean') return v
  if (v === 'true' || v === 1 || v === '1') return true
  if (v === 'false' || v === 0 || v === '0') return false
  return fallback
}
