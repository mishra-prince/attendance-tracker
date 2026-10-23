import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluateFaceEvidence, type FaceObservation, type FaceAction } from './faceEvidence.service';
import { encryptFace, decryptFace } from './faceTemplate.service';

const vector = Array.from({length:128},(_,i) => i === 0 ? 1 : 0);
function neutral(): FaceObservation { return {atMs:0,yaw:0,pitch:0,leftBlink:0,rightBlink:0,smile:0,neutral:true,vector:[...vector]}; }
function action(a: FaceAction): FaceObservation {
  const p = {...neutral(),neutral:false,vector:null};
  if(a==='SMILE') p.smile=.9;
  else if(a==='BLINK') p.leftBlink=p.rightBlink=.9;
  else if(a==='TURN_LEFT')p.yaw=28;else if(a==='TURN_RIGHT')p.yaw=-28;
  else if(a==='LOOK_UP')p.pitch=24;else p.pitch=-24;
  return p;
}
function sequence(actions: FaceAction[]) {
  const observations = [neutral(),neutral(),neutral()];
  for(const a of actions) observations.push(action(a),action(a),...(a==='BLINK'?[neutral(),neutral()]:[action(a)]),neutral(),neutral(),neutral());
  return observations.map((o,i) => ({...o,atMs:i*160}));
}
afterEach(()=>vi.unstubAllEnvs());
describe('Server-evaluated face sequence and identity',()=>{
  it('accepts every distinct two-action sequence with identity checkpoints',()=>{
    const actions:FaceAction[]=['BLINK','SMILE','TURN_LEFT','TURN_RIGHT','LOOK_UP','LOOK_DOWN'];
    for(const a of actions)for(const b of actions)if(a!==b)expect(evaluateFaceEvidence([a,b],sequence([a,b]),vector,{match:.55,continuity:.7}).samples).toBeGreaterThanOrEqual(6);
  });
  it('rejects missing actions, reversed actions, duplicates and stale frame order',()=>{
    const valid=sequence(['SMILE','TURN_LEFT']);
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],sequence(['TURN_LEFT','SMILE']),vector,{match:.55,continuity:.7})).toThrow('OUT_OF_ORDER');
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],valid.slice(0,8),vector,{match:.55,continuity:.7})).toThrow();
    expect(()=>evaluateFaceEvidence(['SMILE','SMILE'],valid,vector,{match:.55,continuity:.7})).toThrow();
    valid[5].atMs=valid[4].atMs;
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],valid,vector,{match:.55,continuity:.7})).toThrow('TIMING');
  });
  it('requires identity before and after actions, including at the end',()=>{
    const valid=sequence(['SMILE','TURN_LEFT']);valid.at(-1)!.vector=vector.map((v)=>-v);
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],valid,vector,{match:.55,continuity:.7})).toThrow('MISMATCH');
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],valid,null,{match:.55,continuity:.7})).toThrow('CHANGED');
    valid.at(-1)!.vector=null;
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],valid,vector,{match:.55,continuity:.7})).toThrow('UNREADABLE');
  });
  it('does not accept a held eye closure as a completed blink',()=>{
    const clip=[neutral(),neutral(),...Array.from({length:8},()=>action('BLINK'))].map((o,i)=>({...o,atMs:i*150}));
    expect(()=>evaluateFaceEvidence(['BLINK','SMILE'],clip,vector,{match:.55,continuity:.7})).toThrow('INCOMPLETE');
  });
  it('rejects NaN or non-normalizable identity vectors',()=>{
    const clip=sequence(['SMILE','TURN_LEFT']);clip[0].vector=Array(128).fill(0);
    expect(()=>evaluateFaceEvidence(['SMILE','TURN_LEFT'],clip,vector,{match:.55,continuity:.7})).toThrow();
  });
  it('encrypts templates nondeterministically and binds them to student and version',()=>{
    vi.stubEnv('FACE_TEMPLATE_ENCRYPTION_KEY','face-encryption-test-only-root-123456789');
    const cipher=encryptFace(vector,'one',1);
    expect(cipher).not.toEqual(encryptFace(vector,'one',1));expect(decryptFace(cipher,'one',1)).toEqual(vector);
    expect(()=>decryptFace(cipher,'two',1)).toThrow();expect(()=>decryptFace(cipher,'one',2)).toThrow();
    vi.stubEnv('FACE_TEMPLATE_ENCRYPTION_KEY','different-encryption-test-root-123456789');expect(()=>decryptFace(cipher,'one',1)).toThrow();
  });
});
