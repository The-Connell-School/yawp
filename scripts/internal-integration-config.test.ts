import {expect,test} from 'bun:test';
import {integrationSettings} from './internal-integration-config.mjs';
const input={internalOrigin:'https://internal.yawp.school',publicOrigin:'https://yawp.school',managementSecretArn:'arn:aws:secretsmanager:us-east-1:422348803522:secret:management-abcdef',productionSecretArn:'arn:aws:secretsmanager:us-east-1:422348803522:secret:production-abcdef',issueSessions:false,deliverEnds:true};
test('drain configuration keeps termination delivery while stopping new impersonations',()=>{
 const result=integrationSettings(input);
 expect(result.variables.INTERNAL_IMPERSONATION_ENABLED).toBe('false');
 expect(result.variables.INTERNAL_END_DELIVERY_ENABLED).toBe('true');
 expect(result.variables.INTERNAL_PLATFORM_ORIGIN).toBe(input.internalOrigin);
 expect(result.secrets.YAWP_MANAGEMENT_SERVICE_KEY).toBe(input.managementSecretArn);
 expect(result.secrets.YAWP_PRODUCTION_SERVICE_KEY).toBe(input.productionSecretArn);
 expect(integrationSettings({...input,issueSessions:true}).variables.INTERNAL_IMPERSONATION_ENABLED).toBe('true');
});
test('invalid deployment cannot enable impersonation without delivery or distinct exact secret references',()=>{
 for(const patch of [{issueSessions:true,deliverEnds:false},{productionSecretArn:input.managementSecretArn},{productionSecretArn:'raw-secret'},{managementSecretArn:input.managementSecretArn+'*'},{publicOrigin:'http://yawp.school'},{internalOrigin:'https://user:pass@internal.yawp.school'},{internalOrigin:'https://internal.yawp.school/path'},{issueSessions:'true'},{unknown:true}]) expect(()=>integrationSettings({...input,...patch})).toThrow();
});
