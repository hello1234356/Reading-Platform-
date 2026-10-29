// Reuse the established moderation-content decision contract; unknown/error
// decisions fail closed. Both club channels and nicknames use its club policy.
export function mayPublish(decision: unknown, allowWarning: boolean): boolean {
  return decision === 'allow' || (decision === 'warn' && allowWarning === true);
}
export function validNickname(text: string): boolean {
  return Array.from(text).length <= 30 && !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(text)
    && !/^(host|admin|administrator|moderator|system|主持人|管理员|系統|系统)$/iu.test(text);
}
