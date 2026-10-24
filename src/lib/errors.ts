export class SafeError extends Error {}
export class UnauthorizedError extends SafeError {
  constructor() { super('登录已失效，请重新使用 GitHub 登录。'); }
}
export class StorageError extends SafeError {
  constructor() { super('无法访问 Android 加密存储。请解锁设备后重试；凭据未被自动删除。'); }
}
export function userMessage(error: unknown): string {
  return error instanceof SafeError ? error.message : '操作未完成，请检查网络连接后重试。';
}
