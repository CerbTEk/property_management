import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePairingCode,isPairingCode} from '../src/pairing-code.mjs';
test('TV entry accepts plain and pasted grouped codes and rejects incomplete or unsupported characters',()=>{
 for(const input of ['0123456789ABCDEF','0123-4567-89ab-cdef','0123 4567 89AB CDEF'])assert.equal(normalizePairingCode(input),'0123456789ABCDEF');
 assert.equal(isPairingCode(normalizePairingCode('0123-4567-89ab-cdef')),true);
 for(const input of ['0123','0123456789ABCDEI','0123456789ABCDEF0','0123456789ABCDE!'])assert.equal(isPairingCode(input),false);
});
