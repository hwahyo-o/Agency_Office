import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {equal,validateJWT,consumeSSE} from './check.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256'};
function token(changes={},secret=privateKey){
 const h=Buffer.from(JSON.stringify({alg:'RS256',kid:'test'})).toString('base64url');
 const p=Buffer.from(JSON.stringify({iss:'https://auth.openai.com',aud:'client',sub:'test',nonce:'nonce',iat:1000,exp:2000,...changes})).toString('base64url');
 return h+'.'+p+'.'+sign('sha256',Buffer.from(h+'.'+p),secret).toString('base64url');
}
test('valid signature and identity',()=>assert.equal(validateJWT(token(),[jwk],'client','nonce',1500),true));
for(const [name,changes] of Object.entries({issuer:{iss:'https://example.com'},audience:{aud:'other'},nonce:{nonce:'other'},expired:{exp:1000},subject:{sub:''},future:{iat:2000},multiple_aud:{aud:['client','other']}})) {
 test('reject '+name,()=>assert.throws(()=>validateJWT(token(changes),[jwk],'client','nonce',1500)));
}
test('reject altered signature',()=>{const other=generateKeyPairSync('rsa',{modulusLength:2048});assert.throws(()=>validateJWT(token({},other.privateKey),[jwk],'client','nonce',1500));});
test('state comparison',()=>{assert.ok(equal('abc','abc'));assert.ok(!equal('abc','ab'));assert.ok(!equal(undefined,undefined));});
async function* chunks(s){for(let i=0;i<s.length;i+=3)yield Buffer.from(s.slice(i,i+3));}
test('fragmented SSE completion',async()=>{await consumeSSE(chunks('data: {"type":"response.output_text.delta","delta":"OK"}\n\ndata: {"type":"response.completed"}\n\n'));});
test('reject stream ending early',async()=>assert.rejects(consumeSSE(chunks('data: {"type":"response.output_text.delta"}\n\n'))));
test('reject failed response after partial output',async()=>assert.rejects(consumeSSE(chunks('data: {"type":"response.output_text.delta"}\n\ndata: {"type":"response.failed"}\n\n'))));
