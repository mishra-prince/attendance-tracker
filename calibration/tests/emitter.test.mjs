import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'calibration/emitter.html'), 'utf8');
const scope = vm.createContext({});
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], scope);
const signal = scope.RoomSignal;
assert.equal(signal.crc8(0xA17C), 0x7e);
assert.equal(signal.crc8(0xffff), 0x24);
assert.equal(Array.from(signal.frameBits(0xA17C)).join(''), '1101110110101010101000010111110001111110');
assert.throws(() => signal.frameBits(-1));
assert.throws(() => signal.samples(0, 3));
assert.throws(() => signal.samples(0, 0, 16000));
assert.throws(() => signal.samples(0, 0, 48000, 1));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'room-lab-interop-'));
const javaHome = process.env.JAVA_HOME;
assert.ok(javaHome, 'Set JAVA_HOME to a JDK 17 or newer.');
function run(tool, args) {
  const result = spawnSync(path.join(javaHome, 'bin', tool), args, {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr + result.stdout);
  if (result.stdout) process.stdout.write(result.stdout);
}
try {
  run('javac', ['-d', temporary, path.join(root,'client/android/calibration/src/main/java/com/attendance/calibration/SignalDecoder.java'), path.join(root,'calibration/tests/DecoderInterop.java')]);
  let fixtures = 0;
  for (const rate of [44100,48000]) for (let profile=0;profile<3;profile++) {
    const pcm = signal.samples(0xA17C, profile, rate, .03);
    assert.equal(pcm.length, rate*2);
    assert.ok(pcm.every(n=>Math.abs(n)<=.030001));
    assert.ok(pcm.subarray(Math.round(rate*1.6)).every(n=>n===0));
    const capture = new Float32Array(rate*6), shift = Math.round(rate*.273);
    for (let i=0;i<capture.length;i++) capture[i]=pcm[(i+shift)%pcm.length];
    const wav = Buffer.from(signal.wav(capture,rate));
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.equal(wav.readUInt32LE(24),rate);
    assert.equal(wav.readUInt32LE(40),rate*6*2);
    const file=path.join(temporary,`p${profile}-${rate}.wav`);
    fs.writeFileSync(file,wav);
    run('java',['-cp',temporary,'com.attendance.calibration.DecoderInterop',file,...signal.profiles[profile].map(String),'A17C','2']);
    if (profile===0) run('java',['-cp',temporary,'com.attendance.calibration.DecoderInterop',file,'3000','4000','BEEF','0']);
    fixtures++;
  }
  console.log(`Emitter assertions passed; ${fixtures} browser-to-Java fixtures and 2 wrong-code checks passed.`);
} finally { fs.rmSync(temporary,{recursive:true,force:true}); }
