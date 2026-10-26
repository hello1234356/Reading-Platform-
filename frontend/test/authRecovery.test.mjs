import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PENDING_RECOVERY_EMAIL_KEY, clearPendingRecoveryEmail, readPendingRecoveryEmail, recoveryErrorKey,
  requestPasswordRecovery, savePendingRecoveryEmail, updateRecoveredPassword, verifyPasswordRecovery } from "../src/lib/authRecovery.js";
import en from "../src/i18n/en.js";
import zh from "../src/i18n/zh.js";

const user={id:"existing-user",email:"reader@tsinglan.org"};
function auth(overrides={}) {
 return {
  resetPasswordForEmail:async()=>({data:{},error:null}),
  verifyOtp:async()=>({data:{user,session:{user}},error:null}),
  getUser:async()=>({data:{user},error:null}),
  updateUser:async()=>({data:{user},error:null}),
  signUp:()=>{throw new Error("Recovery must never create an account");},
  signInWithOtp:()=>{throw new Error("Recovery must never create an account");},
  ...overrides,
 };
}

test("recovery uses the normalized existing account email and the password-recovery endpoint",async()=>{
 let sent;
 assert.equal(await requestPasswordRecovery(auth({resetPasswordForEmail:async email=>{sent=email;return {error:null};}})," Reader@Tsinglan.org "),user.email);
 assert.equal(sent,user.email);
 await assert.rejects(()=>requestPasswordRecovery(auth(),"reader@example.com"),{code:"invalid_domain"});
 assert.equal(await requestPasswordRecovery(auth(),"carrieseventeen.218@gmail.com"),"carrieseventeen.218@gmail.com");
});
test("unknown accounts get the same neutral request result",async()=>{
 assert.equal(await requestPasswordRecovery(auth({resetPasswordForEmail:async()=>({error:{code:"user_not_found"}})}),user.email),user.email);
});
test("only a recovery OTP is verified, and a matching authenticated identity is required",async()=>{
 let sent;
 assert.equal(await verifyPasswordRecovery(auth({verifyOtp:async params=>{sent=params;return {data:{user,session:{user}},error:null};}}),{email:" Reader@Tsinglan.org ",token:" 123456 "}),user.id);
 assert.deepEqual(sent,{email:user.email,token:"123456",type:"recovery"});
 await assert.rejects(()=>verifyPasswordRecovery(auth(),{email:user.email,token:""}),{code:"recovery_code_invalid"});
 for(const data of [{user,session:null},{user,session:{user:{id:"other"}}},{user:{...user,email:"other@tsinglan.org"},session:{user}}]) {
  await assert.rejects(()=>verifyPasswordRecovery(auth({verifyOtp:async()=>({data,error:null})}),{email:user.email,token:"123456"}),{code:"recovery_session_invalid"});
 }
});
test("invalid or expired OTPs cannot reach the new-password step",async()=>{
 const error={code:"otp_expired",message:"Token has expired"};
 await assert.rejects(()=>verifyPasswordRecovery(auth({verifyOtp:async()=>({error})}),{email:user.email,token:"123456"}),value=>value===error);
 assert.equal(recoveryErrorKey(error,"verify"),"auth.resetCodeInvalid");
});
test("password update verifies the current user and updates only the password",async()=>{
 let params;const order=[];
 const api=auth({getUser:async()=>{order.push("identity");return {data:{user},error:null};},updateUser:async value=>{order.push("update");params=value;return {data:{user},error:null};}});
 await updateRecoveredPassword(api,{email:user.email,verifiedUserId:user.id,password:"new-secret1",confirmation:"new-secret1"});
 assert.deepEqual(order,["identity","update"]);assert.deepEqual(params,{password:"new-secret1"});
});
test("missing verification, session expiry and account switches block password changes",async()=>{
 let updates=0;
 for(const [verifiedUserId,current] of [[null,user],[user.id,null],[user.id,{...user,id:"other"}],[user.id,{...user,email:"other@tsinglan.org"}]]) {
  const api=auth({getUser:async()=>({data:{user:current},error:null}),updateUser:async()=>{updates++;return {error:null};}});
  await assert.rejects(()=>updateRecoveredPassword(api,{email:user.email,verifiedUserId,password:"new-secret1",confirmation:"new-secret1"}),{code:"recovery_session_invalid"});
 }
 assert.equal(updates,0);
});
test("short, mismatched and server-rejected passwords show specific errors",async()=>{
 const values={email:user.email,verifiedUserId:user.id,password:"new-secret1",confirmation:"new-secret1"};
 await assert.rejects(()=>updateRecoveredPassword(auth(),{...values,password:"short"}),{code:"password_too_short"});
 await assert.rejects(()=>updateRecoveredPassword(auth(),{...values,confirmation:"different"}),{code:"password_mismatch"});
 const error={code:"weak_password"};
 await assert.rejects(()=>updateRecoveredPassword(auth({updateUser:async()=>({error})}),values),value=>value===error);
 assert.equal(recoveryErrorKey(error,"password"),"auth.passwordStronger");
 assert.equal(recoveryErrorKey({code:"same_password"},"password"),"auth.passwordUnchanged");
});
test("refresh-safe recovery state stores only email, never verification or password secrets",()=>{
 const values=new Map();const storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 savePendingRecoveryEmail(storage," Reader@Tsinglan.org ");
 assert.deepEqual([...values],[[PENDING_RECOVERY_EMAIL_KEY,user.email]]);assert.equal(readPendingRecoveryEmail(storage),user.email);
 clearPendingRecoveryEmail(storage);assert.equal(readPendingRecoveryEmail(storage),"");
 values.set(PENDING_RECOVERY_EMAIL_KEY,"other@example.com");assert.equal(readPendingRecoveryEmail(storage),"");
});
test("recovery errors have English and Chinese copy without exposing raw backend details",()=>{
 for(const [error,step] of [[{status:429},"request"],[{message:"Failed to fetch"},"request"],[{code:"password_mismatch"},"password"],[{code:"password_too_short"},"password"],[{code:"invalid_domain"},"request"],[{code:"recovery_session_invalid"},"password"],[{message:"JWT expired"},"password"],[{message:"anon key missing"},"request"],[{},"request"],[{},"verify"],[{},"password"]]) {
  const key=recoveryErrorKey(error,step).split(".")[1];assert.ok(en.auth[key]);assert.ok(zh.auth[key]);
 }
});
test("recovery email contains a one-time code instead of a hash-router login link",async()=>{
 const template=await readFile(new URL("../../supabase/templates/recovery.html",import.meta.url),"utf8");
 assert.match(template,/\{\{ \.Token \}\}/);assert.doesNotMatch(template,/ConfirmationURL|TokenHash/);
});
