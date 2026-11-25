// 공통 HTTP 유틸: 오류 형식 { error: { code, message } }
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what}을(를) 찾을 수 없습니다`);
export const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);

/** Express 4는 async 핸들러의 오류를 잡지 않으므로 get/post/patch/delete를 감싸 next(err)로 넘긴다 */
export function asyncRouter(router) {
  for (const m of ['get', 'post', 'patch', 'put', 'delete']) {
    const orig = router[m].bind(router);
    router[m] = (path, ...handlers) =>
      orig(path, ...handlers.map((h) => (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  return router;
}

/** zod 스키마로 본문 검증 */
export function parseBody(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success)
    throw badRequest(
      r.error.issues.map((i) => `${i.path.join('.') || '(본문)'}: ${i.message}`).join(' / '),
      r.error.issues,
    );
  return r.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON 형식 오류' } });
  }
  if (String(err?.code).startsWith('SQLITE_CONSTRAINT') || /^23\d{3}$/.test(String(err?.code))) {
    return res.status(409).json({ error: { code: 'CONSTRAINT', message: err.message } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: '서버 오류' } });
}
