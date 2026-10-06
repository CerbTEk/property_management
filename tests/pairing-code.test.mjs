import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pairingAlphabet,generatePairingCode,normalizePairingCode,isPairingCode} from '../src/pairing-code.mjs';
test('TV entry accepts plain and pasted grouped codes and rejects incomplete or unsupported characters',()=>{
 for(const input of ['0123456789ABCDEF','0123-4567-89ab-cdef','0123 4567 89AB CDEF'])assert.equal(normalizePairingCode(input),'0123456789ABCDEF');
 assert.equal(isPairingCode(normalizePairingCode('0123-4567-89ab-cdef')),true);
 for(const input of ['0123','0123456789ABCDEI','0123456789ABCDEF0','0123456789ABCDE!'])assert.equal(isPairingCode(input),false);
});
test('generated pairing alphabet excludes O and rejects both letter cases and zero from generation',()=>{
 assert.equal(pairingAlphabet.length,31);assert.equal(new Set(pairingAlphabet).size,31);assert.equal(/[0Oo]/.test(pairingAlphabet),false);
 for(const value of ['O123456789ABCDEF','o123456789ABCDEF'])assert.equal(isPairingCode(normalizePairingCode(value)),false);
 assert.equal(isPairingCode('0123456789ABCDEF'),true);
});
test('generation produces exactly 16 allowed characters and rejects biased tail bytes',()=>{
 let calls=0;const code=generatePairingCode(bytes=>{bytes.fill(calls++===0?255:0);return bytes;});
 assert.equal(calls,2);assert.equal(code,'1'.repeat(16));
 for(let i=0;i<100;i++){const generated=generatePairingCode();assert.equal(generated.length,16);assert.equal(/[0Oo]/.test(generated),false);assert.equal(isPairingCode(generated),true);}
});
