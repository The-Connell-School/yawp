// Secret references only: this preflight never fetches credentials or calls AWS.
export function integrationSettings(input) {
 const fields=['internalOrigin','publicOrigin','managementSecretArn','productionSecretArn','issueSessions','deliverEnds'];
 if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).sort().join(',')!==fields.sort().join(',')) throw new Error('Provide exactly the six integration configuration fields');
 for(const key of ['issueSessions','deliverEnds']) if(typeof input[key]!=='boolean') throw new Error('Activation flags must be booleans');
 if(input.issueSessions && !input.deliverEnds) throw new Error('Session issuance requires termination delivery');
 const origin=(value)=>{
  if(typeof value!=='string')throw new Error('Origin must be HTTPS');
  const url=new URL(value);
  if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)throw new Error('Use a plain HTTPS origin');
  return url.origin;
 };
 for(const key of ['managementSecretArn','productionSecretArn']) if(typeof input[key]!=='string' || !/^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$/.test(input[key])) throw new Error('Use exact Secrets Manager ARNs, never credential values');
 if(input.managementSecretArn===input.productionSecretArn)throw new Error('Distinct directional secret references required');
 return {
  variables:{INTERNAL_PLATFORM_ORIGIN:origin(input.internalOrigin),YAWP_PUBLIC_ORIGIN:origin(input.publicOrigin),INTERNAL_IMPERSONATION_ENABLED:String(input.issueSessions),INTERNAL_END_DELIVERY_ENABLED:String(input.deliverEnds)},
  secrets:{YAWP_MANAGEMENT_SERVICE_KEY:input.managementSecretArn,YAWP_PRODUCTION_SERVICE_KEY:input.productionSecretArn}
 };
}
