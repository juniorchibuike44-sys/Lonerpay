// Persist only customer-safe messages, never raw provider payloads or identifiers.
export const FAILED_STATUSES = ['identification_failed','assignment_failed','failed'];
export function verificationFailure(data={},stage='identification') {
  const reason=[data.reason,data.message,data.description,data.failure_reason,data.errors?.[0]?.message,data.customer?.identification?.reason].filter(x=>typeof x==='string').join(' ').toLowerCase();
  const result=(failure_code,failure_reason)=>({failure_code,failure_reason});
  if(/timeout|timed out|unavailable|try again|temporar|network|busy|connection|rate limit|secret key|unauthoriz|forbidden|permission|not enabled/.test(reason))return result('provider_unavailable','The verification service could not complete the check. Please try again later.');
  if(/name/.test(reason)&&/match|incorrect|invalid|differ/.test(reason))return result('name_mismatch','Your name could not be matched to your bank identity. Check your first and last name in your LonerPay profile and use your own bank account and BVN.');
  if(/bank code|bank_code|unsupported bank|invalid bank|bank.*not supported/.test(reason))return result('bank_invalid','The selected bank could not be verified. Select the bank where your account is held, then try again.');
  if(/bvn/.test(reason)&&/account/.test(reason))return result('bank_identity_mismatch','Your bank account and BVN could not be verified together. Check the selected bank, account number and BVN. The bank account must belong to you and be linked to that BVN.');
  if(/bvn/.test(reason)&&/invalid|incorrect|not found|not valid|failed|match/.test(reason))return result('bvn_invalid','Your BVN could not be verified. Check your 11-digit BVN and make sure it belongs to you and is linked to the bank account you entered.');
  if(/account/.test(reason)&&/invalid|incorrect|not found|not valid|failed|match|does not exist/.test(reason))return result('account_invalid','The bank account could not be verified. Check the selected bank and your 10-digit account number, and use an account linked to your BVN.');
  if(/phone/.test(reason)&&/invalid|incorrect|match|missing/.test(reason))return result('phone_invalid','Your phone number could not be verified. Check the phone number in your LonerPay profile, then try again.');
  if(stage==='assignment')return result('assignment_failed','Your receiving account could not be created. Please contact LonerPay support if trying again does not resolve it.');
  return result('identification_failed','Your identity could not be verified. The provider did not supply a specific customer-safe reason. Check your profile name, selected bank, account number and BVN, then try again.');
}
