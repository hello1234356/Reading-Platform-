import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { availableVotes, isSingleSentence, sentenceValidationError, relaySubmissionError, relayProgress, shanghaiDateInput, shanghaiMidnight, orderedWriterSlots, compiledRelayStory } from '../src/lib/creativeEventsModel.js';

const sentenceCases=JSON.parse(await readFile(new URL('./fixtures/relaySentences.json',import.meta.url),'utf8'));
test('dialogue punctuation does not end the surrounding sentence',()=>{
  for(const {text,valid} of sentenceCases) assert.equal(isSingleSentence(text),valid,text);
  assert.equal(isSingleSentence('😀'.repeat(999)+'.'),true,'Unicode code points match PostgreSQL character limits');
  assert.match(sentenceValidationError('x'.repeat(1000)+'.'),/2–1000/);
  assert.match(sentenceValidationError('No ending'),/End your sentence/);
});
test('submission failures identify stale turns, account permissions, login and connection errors',()=>{
  assert.match(relaySubmissionError({message:'The writing turn has changed. Refresh and try again.'}),/turn has changed or expired/);
  assert.match(relaySubmissionError({code:'42501',message:'This room is invitation only.'}),/invited writer/);
  assert.match(relaySubmissionError({message:'JWT expired'}),/login session has expired/);
  assert.match(relaySubmissionError({message:'Failed to fetch'}),/connection failed/);
  assert.equal(relaySubmissionError({message:'Submissions are paused.'}),'Submissions are paused.');
});

test('relay validation handles dialogue, abbreviations and Chinese', () => {
  for (const value of ['One sentence.', 'Dr. Li opened the door.', '“Really?!”', '门开了。', 'He paused… then ran!']) assert.equal(isSingleSentence(value), true, value);
  for (const value of ['', 'No ending', 'First. Second.', '一句。第二句。', 'First?\nSecond!', 'a'.repeat(1000)+'.']) assert.equal(isSingleSentence(value), false, value);
});
test('queue progress follows server order and preserves both rounds', () => {
  const queue = [{id:1,done:true,round:1},{id:2,done:false,round:1},{id:3,done:false,round:2}];
  assert.deepEqual(relayProgress(queue), {completed:1,total:3,current:queue[1],remaining:queue.slice(1)});
  assert.equal(relayProgress(queue.map(t=>({...t,done:true}))).current, undefined);
});
test('date editing stays at Shanghai midnight across UTC boundaries', () => {
  assert.equal(shanghaiDateInput('2026-11-25T16:00:00Z'), '2026-11-26');
  assert.equal(new Date(shanghaiMidnight('2026-11-26')).toISOString(), '2026-11-25T16:00:00.000Z');
});
test('vote budget counts the current user’s allocations across themes', () => {
  assert.equal(availableVotes([{myVotes:2},{myVotes:1}]),0);
  assert.equal(availableVotes([{myVotes:1},{myVotes:0}]),2);
});

test('pending accounts stay last without moving pinned first and second writers', () => {
  const slots=[{name:'Carrie',id:'a',pinned:true},{name:'Yiru',id:'b',pinned:true},{name:'Nick',id:null},{name:'Yiyan',id:'c'},{name:'Eason',id:null}];
  assert.deepEqual(orderedWriterSlots(slots).map(s=>s.name),['Carrie','Yiru','Yiyan','Nick','Eason']);
  assert.equal(relayProgress([{id:'pending',userId:null,done:false},{id:'known',userId:'a',done:false}]).current.id,'known');
});
test('compiled reading text keeps the opening and contributions in order without names', () => {
  assert.equal(compiledRelayStory({openingSentence:'The door winked.',story:[{name:'Carrie',sentence:'Then it sneezed.'},{name:'Yiyan',sentence:'窗户笑了。'}]}),'The door winked. Then it sneezed. 窗户笑了。');
});
