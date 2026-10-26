import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { requireSupabase } from "../lib/supabase";
import { clearPendingRecoveryEmail, readPendingRecoveryEmail, recoveryErrorKey, requestPasswordRecovery,
  savePendingRecoveryEmail, updateRecoveredPassword, verifyPasswordRecovery } from "../lib/authRecovery";

export default function PasswordRecovery({initialEmail="",onBack,onComplete}) {
  const {t}=useTranslation();
  const restored=readPendingRecoveryEmail(window.sessionStorage);
  const [step,setStep]=useState(restored ? "verify" : "request");
  const [email,setEmail]=useState(restored || initialEmail);
  const [code,setCode]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [verifiedUserId,setVerifiedUserId]=useState(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [coolingDown,setCoolingDown]=useState(false);
  const pending=useRef(false);
  const retryAt=useRef(0);
  useEffect(()=>{
    if (!coolingDown) return;
    const timer=window.setTimeout(()=>setCoolingDown(false),Math.max(0,retryAt.current-Date.now()));
    return ()=>window.clearTimeout(timer);
  },[coolingDown]);

  async function run(operation,context=step) {
    if (pending.current) return;
    pending.current=true;setLoading(true);setMessage("");
    try { await operation(); }
    catch(error) { setMessage(t(recoveryErrorKey(error,context))); }
    finally { pending.current=false;setLoading(false); }
  }
  async function sendCode() {
    if (Date.now()<retryAt.current) return;
    await run(async()=>{
      const normalized=await requestPasswordRecovery(requireSupabase().auth,email);
      savePendingRecoveryEmail(window.sessionStorage,normalized);
      setEmail(normalized);setCode("");setStep("verify");
      retryAt.current=Date.now()+60_000;setCoolingDown(true);
    },"request");
  }
  function submit(event) {
    event.preventDefault();
    if (step==="request") { void sendCode();return; }
    void run(async()=>{
      if (step==="verify") {
        const id=await verifyPasswordRecovery(requireSupabase().auth,{email,token:code});
        setVerifiedUserId(id);setCode("");setStep("password");
      } else {
        await updateRecoveredPassword(requireSupabase().auth,{email,verifiedUserId,password,confirmation});
        clearPendingRecoveryEmail(window.sessionStorage);setPassword("");setConfirmation("");
        setStep("complete");
      }
    });
  }
  function changeEmail() {
    if (pending.current) return;
    clearPendingRecoveryEmail(window.sessionStorage);setStep("request");setVerifiedUserId(null);
    setCode("");setPassword("");setConfirmation("");setMessage("");
  }
  return <section className="password-recovery" aria-label={t("auth.resetTitle")}>
    {step==="complete" ? <>
      <p className="login-recovery-help" role="status">{t("auth.passwordUpdated")}</p>
      <button className="beautiful-login-button" type="button" onClick={onComplete}>{t("auth.continue")}</button>
    </> : <>
      <p className="login-recovery-help">{t(step==="request" ? "auth.resetRequestHelp" : step==="verify" ? "auth.resetSentHelp" : "auth.resetPasswordHelp",{email})}</p>
      <form className="beautiful-login-form" onSubmit={submit}>
        {step==="request" && <label><span>{t("auth.email")}</span><div className="pretty-input-wrap">
          <input type="email" autoComplete="email" placeholder="name@tsinglan.org" value={email} onChange={event=>setEmail(event.target.value)} required disabled={loading}/>
          <em aria-hidden="true">✉</em>
        </div></label>}
        {step==="verify" && <label><span>{t("auth.code")}</span><div className="pretty-input-wrap">
          <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder={t("auth.codePlaceholder")} value={code} onChange={event=>setCode(event.target.value)} required disabled={loading}/>
          <em aria-hidden="true">#</em>
        </div></label>}
        {step==="password" && <>
          <label><span>{t("auth.newPassword")}</span><div className="pretty-input-wrap"><input type="password" autoComplete="new-password" value={password} onChange={event=>setPassword(event.target.value)} minLength={6} required disabled={loading}/></div></label>
          <label><span>{t("auth.confirmPassword")}</span><div className="pretty-input-wrap"><input type="password" autoComplete="new-password" value={confirmation} onChange={event=>setConfirmation(event.target.value)} minLength={6} required disabled={loading}/></div></label>
        </>}
        <button className="beautiful-login-button" disabled={loading || (step==="request" && coolingDown)}>{loading ? t("auth.pleaseWait") : step==="request" && coolingDown ? t("auth.resetWait") : t(step==="request" ? "auth.sendResetCode" : step==="verify" ? "auth.verifyResetCode" : "auth.savePassword")}</button>
      </form>
      {message && <p className="login-message beautiful-message" role="alert">{message}</p>}
      <div className="login-verification-actions">
        {step==="verify" && <button type="button" disabled={loading || coolingDown} onClick={()=>void sendCode()}>{coolingDown ? t("auth.codeSent") : t("auth.resend")}</button>}
        {step!=="request" && <button type="button" disabled={loading} onClick={changeEmail}>{t("auth.changeEmail")}</button>}
        <button type="button" disabled={loading} onClick={onBack}>{t("auth.backToLogin")}</button>
      </div>
    </>}
  </section>;
}
