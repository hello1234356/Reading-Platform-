import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClubTags, validateClubDetails, mergeClubMessages } from '../src/lib/clubValidation.js';
const valid={title:'A circle',description:'Read with us',duration:'4 weeks',membersWanted:8,tags:['fantasy']};
test('club capacity is an integer and cannot exclude existing members',()=>{
 assert.equal(validateClubDetails(valid,8),null);
 assert.equal(validateClubDetails({...valid,membersWanted:7},8),'capacityInvalid');
 assert.equal(validateClubDetails({...valid,membersWanted:8.5},8),'capacityInvalid');
 assert.equal(validateClubDetails({...valid,membersWanted:''}),'capacityInvalid');
});
test('club tags accept both comma styles, deduplicate, and enforce bounds',()=>{
 assert.deepEqual(parseClubTags(' fantasy,共读，fantasy, '),['fantasy','共读']);
 assert.equal(validateClubDetails({...valid,tags:['a'.repeat(31)]}),'tagsInvalid');
 assert.equal(validateClubDetails({...valid,tags:Array(11).fill('x')}),'tagsInvalid');
});
test('settings require real values and respect shared creation limits',()=>{
 for(const [field,code] of [['title','nameInvalid'],['description','descriptionInvalid'],['duration','durationInvalid']]) assert.equal(validateClubDetails({...valid,[field]:'  '}),code);
 assert.equal(validateClubDetails({...valid,description:'a'.repeat(351)}),'descriptionInvalid');
});
test('live, paginated and own-send deliveries merge without duplicates and preserve timestamp ties',()=>{
 const row=(id,time='2026-10-29T10:00:00Z')=>({id,createdAt:time,message:id});
 const merged=mergeClubMessages([row('9007199254740994'),row('2','2026-10-28T10:00:00Z')],[row('9007199254740993'),{...row('9007199254740994'),message:'updated'}]);
 assert.deepEqual(merged.map(r=>r.id),['2','9007199254740993','9007199254740994']);
 assert.equal(merged.at(-1).message,'updated');
});
