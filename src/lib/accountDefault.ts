/**
 * 默认公众号账号的本地持久化。
 * 发布面板与账号管理器共用同一份 localStorage，保证「设为默认」在两者之间一致。
 */
const KEY = 'inkforge.defaultAccountId'

export function getDefaultAccountId(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setDefaultAccountId(id: string): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export function clearDefaultAccountId(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
