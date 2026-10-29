import test from 'node:test';
import assert from 'node:assert/strict';
import { findClubMentionQuery,clubMentionSuggestions,splitClubMentions } from '../src/lib/clubMentions.js';
test('mention picker handles @, nickname/username searches and ignores email addresses',()=>{
 assert.equal(findClubMentionQuery('Hello @',7).query,'');
 assert.equal(findClubMentionQuery('a@b.com',7),null);
 const members=[{userId:'a',username:'Alice',nickname:'月亮'},{userId:'b',username:'Bob Reader',nickname:'Sun'}];
 assert.equal(clubMentionSuggestions(members,'月')[0].userId,'a');
 assert.equal(clubMentionSuggestions(members,'bob')[0].userId,'b');
});
test('mention rendering keeps stable IDs, punctuation, repeats and complete message text',()=>{
 const references=[{userId:'b',username:'Bob (reader)'},{userId:'a',username:'Alice'}];
 const text='Hi @Bob (reader), @Alice! reader@Alice stays plain. @Bob (reader)';
 const parts=splitClubMentions(text,references);
 assert.equal(parts.map(part=>typeof part==='string'?part:part.text).join(''),text);
 assert.deepEqual(parts.filter(part=>typeof part!=='string').map(part=>part.userId),['b','a','b']);
 assert.deepEqual(splitClubMentions('@Alice',[]),['@Alice']);
});
