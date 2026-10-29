import test from 'node:test';
import assert from 'node:assert/strict';
import { getClubMemberName, getClubMemberTags, validateClubNickname } from '../src/lib/clubMemberProfile.js';
import { mayPublish, validNickname } from '../../supabase/functions/club-content/policy.ts';
test('club display names use the membership nickname and preserve original identity',()=>{
 const member={nickname:'Moon',username:'original',accountName:'Original account'};
 assert.equal(getClubMemberName(member),'Moon');
 assert.equal(getClubMemberName({...member,nickname:''}),'original');
 assert.equal(member.username,'original');
 assert.equal(getClubMemberName(null,'Former member'),'Former member');
});
test('nickname checks allow clearing and both languages but reject hidden identity changes',()=>{
 for(const name of ['', 'Moon reader', '共读者', '🌙'.repeat(30)]){assert.equal(validateClubNickname(name),null);assert.equal(validNickname(name),true);}
 for(const name of ['x'.repeat(31),'a\nb','a\u202eb','Host','管理员']){assert.notEqual(validateClubNickname(name),null);assert.equal(validNickname(name),false);}
});
test('server moderation keeps existing allow/warn override behavior and fails closed',()=>{
 assert.equal(mayPublish('allow',false),true);
 assert.equal(mayPublish('warn',false),false);
 assert.equal(mayPublish('warn',true),true);
 for(const action of ['block','report','error','unknown',null,undefined])assert.equal(mayPublish(action,true),false);
});

test('member tag lookup uses current selections for any message age and handles removals and renamed tags',()=>{
 const tags=[{id:1,name:'First-time reader'},{id:2,name:'重读者'},{id:3,name:'Team moon'},{id:4,name:'Drama'}];
 const before={tags,assignments:[{user_id:'alice',tag_id:1},{user_id:'bob',tag_id:2}]};
 assert.deepEqual(getClubMemberTags(before,'alice').map(tag=>tag.name),['First-time reader']);
 const after={tags:tags.map(tag=>tag.id===3 ? {...tag,name:'Team stars'} : tag),assignments:[{user_id:'alice',tag_id:2},{user_id:'alice',tag_id:3},{user_id:'bob',tag_id:1}]};
 assert.deepEqual(getClubMemberTags(after,'alice').map(tag=>tag.name),['重读者','Team stars']);
 assert.deepEqual(getClubMemberTags(after,'bob').map(tag=>tag.name),['First-time reader']);
 assert.deepEqual(getClubMemberTags({...after,assignments:[]},'alice'),[]);
 assert.equal(getClubMemberTags({tags,assignments:tags.map(tag=>({user_id:'alice',tag_id:String(tag.id)}))},'alice').length,3);
});
