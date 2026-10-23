import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

let db: PGlite, socket: PGLiteSocketServer, server: Server, prisma: PrismaClient, base: string;
const id = Object.fromEntries(['admin','teacherUser','otherUser','hodUser','teacher','otherTeacher','hod','dept','otherDept','course','otherCourse','year','semester','section','otherSection','subject','slot'].map((k) => [k,randomUUID()]));
const tokens: Record<string,string> = {};
let student: any, second: any, reader: any, otherReader: any, sessionId: string, firstEvent: string;
const password = 'TestPassword!123';
async function req(path: string, actor = 'admin', body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  return fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'Threshold',...(tokens[actor]?{Authorization:'Bearer '+tokens[actor]}:{})},body:body===undefined?undefined:JSON.stringify(body)});
}
async function login(actor: string, email: string, portal = 'staff') {
  const r=await req('/auth/login','none',{email,password,portal}); expect(r.status).toBe(200);tokens[actor]=(await r.json()).data.accessToken;
}
async function tap(uid='AABBCCDD',eventId=randomUUID(),device=reader,sentAt=Date.now()) {
  return fetch(base+'/api/rfid/device/tap',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+device.key,'X-Reader-Id':device.reader_id},body:JSON.stringify({eventId,uid,sentAt})});
}
async function result(r: Response) { const b=await r.json(); expect(r.status,JSON.stringify(b)).toBe(200);return b.data; }
async function assign(studentId: string,uid: string) {
  const capture=await result(await req(`/rfid/readers/${reader.reader_id}/capture`,'admin',{}));
  expect((await result(await tap(uid))).outcome).toBe('CAPTURED');
  return req('/rfid/cards/assign','admin',{captureId:capture.capture_id,studentId});
}
function advance(seconds=11) { vi.setSystemTime(new Date(Date.now()+seconds*1000)); }
async function newStudent(roll: string) {
  const r=await req('/rfid/students','admin',{name:'Student '+roll,roll_no:roll,email:roll.toLowerCase()+'@test.invalid',password,section_id:id.section,course_id:id.course});
  expect(r.status).toBe(201);return (await r.json()).data;
}
beforeAll(async()=>{
  vi.stubEnv('NODE_ENV','test');vi.stubEnv('JWT_SECRET','rfid-integration-access-secret-1234567890');vi.stubEnv('JWT_REFRESH_SECRET','rfid-integration-refresh-secret-1234567890');
  vi.stubEnv('BLE_BEACON_SECRET','rfid-integration-ble-secret-1234567890');vi.stubEnv('RFID_CARD_HASH_SECRET','rfid-integration-hash-secret-1234567890');vi.stubEnv('ATTENDANCE_TIMEZONE','Asia/Kolkata');
  db=await PGlite.create();
  for(const file of ['20260916052028_init','20261020120000_bluetooth_and_sessions','20261023030000_rfid_attendance']) await db.exec(await readFile(new URL('../prisma/migrations/'+file+'/migration.sql',import.meta.url),'utf8'));
  socket=new PGLiteSocketServer({db,host:'127.0.0.1',port:5551});await socket.start();
  vi.stubEnv('DATABASE_URL','postgresql://postgres:postgres@127.0.0.1:5551/postgres?connection_limit=1');prisma=(await import('../src/utils/prisma')).prisma;await prisma.$connect();
  const hash=await bcrypt.hash(password,4);
  for(const [key,email,role] of [['admin','admin@test.invalid','ADMIN'],['teacherUser','teacher@test.invalid','TEACHER'],['otherUser','other@test.invalid','TEACHER'],['hodUser','hod@test.invalid','HOD']] as const) await prisma.user.create({data:{user_id:id[key],name:key,email,role,password_hash:hash}});
  await prisma.department.create({data:{department_id:id.dept,name:'Computing',code:'CS'}});await prisma.department.create({data:{department_id:id.otherDept,name:'Other',code:'OTHER'}});
  await prisma.academicYear.create({data:{academic_year_id:id.year,name:'2026',start_date:new Date('2026-01-01'),end_date:new Date('2026-12-31')}});
  await prisma.semester.create({data:{semester_id:id.semester,academic_year_id:id.year,semester_number:1,start_date:new Date('2026-01-01'),end_date:new Date('2026-12-31')}});
  for(const [course_id,department_id] of [[id.course,id.dept],[id.otherCourse,id.otherDept]]) await prisma.course.create({data:{course_id,department_id,course_code:course_id,course_name:course_id}});
  for(const [section_id,course_id] of [[id.section,id.course],[id.otherSection,id.otherCourse]]) await prisma.section.create({data:{section_id,course_id,semester_id:id.semester,section_name:section_id}});
  for(const [teacher_id,user_id,department_id] of [[id.teacher,id.teacherUser,id.dept],[id.otherTeacher,id.otherUser,id.otherDept],[id.hod,id.hodUser,id.dept]]) await prisma.teacher.create({data:{teacher_id,user_id,department_id,name:teacher_id,employee_id:teacher_id}});
  await prisma.department.update({where:{department_id:id.dept},data:{hod_id:id.hod}});
  await prisma.subject.create({data:{subject_id:id.subject,subject_code:'RF101',subject_name:'RFID Class',course_id:id.course,semester_id:id.semester}});
  await prisma.subjectTeacher.create({data:{subject_id:id.subject,section_id:id.section,teacher_id:id.teacher}});
  await prisma.timetable.create({data:{timetable_id:id.slot,subject_id:id.subject,section_id:id.section,teacher_id:id.teacher,day_of_week:'Fri',start_time:'09:00',end_time:'10:00',room_no:'101'}});
  const app=(await import('../src/app')).default;server=app.listen(0,'127.0.0.1');await new Promise<void>((r)=>server.once('listening',r));base='http://127.0.0.1:'+(server.address() as any).port;
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-23T04:00:00Z'));
  await login('admin','admin@test.invalid');await login('teacher','teacher@test.invalid');await login('other','other@test.invalid');await login('hod','hod@test.invalid');
},60000);
afterAll(async()=>{vi.useRealTimers();await new Promise<void>((r)=>server?.close(()=>r())??r());await prisma?.$disconnect();await socket?.stop();await db?.close();vi.unstubAllEnvs();});

describe.sequential('Main RFID attendance: real HTTP, database, lifecycle and access control',()=>{
  it('applies all additive migrations without removing prior tables',async()=>{expect(await prisma.rfidReader.count()).toBe(0);expect(await prisma.biometricEnrollment.count()).toBe(0);expect((await fetch(base+'/ready')).status).toBe(200);});
  it('requires admin identity to provision readers and students',async()=>{
    for(const role of ['teacher','hod','none']) expect((await req('/rfid/readers',role,{name:'Reader',room_no:'101'})).status).toBe(role==='none'?401:403);
  });
  it('registers student, account and section subject roster atomically',async()=>{
    const before=await prisma.user.count();
    expect((await req('/rfid/students','admin',{name:'Wrong',email:'wrong@test.invalid',password,roll_no:'WRONG',section_id:id.otherSection,course_id:id.course})).status).toBe(400);
    expect(await prisma.user.count()).toBe(before);
    student=await newStudent('S001');second=await newStudent('S002');
    expect(await prisma.enrollment.count({where:{student_id:student.student_id,subject_id:id.subject,status:'active'}})).toBe(1);
    await login('student','s001@test.invalid','student');
    expect((await req('/rfid/readers','student')).status).toBe(403);
  });
  it('automatically exposes the new section students only to assigned staff',async()=>{
    const day=await result(await req('/rfid/day','teacher'));expect(day.classes[0].roster.map((s:any)=>s.student_id)).toContain(student.student_id);
    expect((await result(await req('/rfid/day','other'))).classes).toHaveLength(0);
    expect((await result(await req('/rfid/day','hod'))).classes).toHaveLength(1);
    expect((await result(await req('/students','other'))).length).toBe(0);
    expect((await req('/rfid/day','student')).status).toBe(403);
  });
  it('stores only hashed reader credentials and requires device authentication',async()=>{
    const response=await req('/rfid/readers','admin',{name:'Classroom S3',room_no:'101'});expect(response.status).toBe(201);reader=(await response.json()).data;
    expect(reader.key.length).toBeGreaterThan(40);expect((await prisma.rfidReader.findUniqueOrThrow({where:{reader_id:reader.reader_id}})).key_hash).not.toBe(reader.key);
    expect(JSON.stringify(await result(await req('/rfid/readers')))).not.toContain(reader.key);
    expect((await tap('AABBCCDD',randomUUID(),{...reader,key:'bad'.repeat(15)})).status).toBe(401);
    expect((await req('/rfid/device/tap','student',{eventId:randomUUID(),uid:'AABBCCDD',sentAt:Date.now()})).status).toBe(401);
    expect((await tap('not-a-uid')).status).toBe(400);
  });
  it('captures a card without awarding attendance and binds it only after admin confirmation',async()=>{
    expect((await assign(student.student_id,'AABBCCDD')).status).toBe(200);
    expect(await prisma.attendance.count()).toBe(0);expect(await prisma.rfidCard.count({where:{student_id:student.student_id,is_active:true}})).toBe(1);
    expect(JSON.stringify(await prisma.rfidCard.findMany())).not.toContain('AABBCCDD');
  });
  it('rejects assigning another student’s active card without losing either assignment',async()=>{
    expect((await assign(second.student_id,'AABBCCDD')).status).toBe(409);
    await req(`/rfid/readers/${reader.reader_id}/capture`,'admin',undefined,'DELETE');
    expect((await assign(second.student_id,'11223344')).status).toBe(200);
    expect(await prisma.rfidCard.count({where:{is_active:true}})).toBe(2);
  });
  it('creates today’s real class and present record on the first entry tap',async()=>{
    advance();firstEvent=randomUUID();const row=await result(await tap('AABBCCDD',firstEvent));expect(row.outcome).toBe('RECORDED');expect(row.direction).toBe('IN');
    const a=await prisma.attendance.findFirstOrThrow({where:{student_id:student.student_id}});sessionId=a.session_id;expect(a.method).toBe('RFID');expect(a.status).toBe('present');
    expect((await prisma.rfidVisit.findFirstOrThrow()).entry_at.getTime()).toBe(Date.now());
  });
  it('does not toggle a retried request or repeat its audit record',async()=>{
    const before=await prisma.auditLog.count();const row=await result(await tap('AABBCCDD',firstEvent));expect(row.duplicate).toBe(true);expect(row.direction).toBe('IN');
    expect(await prisma.rfidVisit.count()).toBe(1);expect(await prisma.auditLog.count()).toBe(before);
    expect((await tap('11223344',firstEvent)).status).toBe(409);
  });
  it('reuses the RFID class on teacher quick-start and keeps other staff out',async()=>{
    expect((await req('/sessions/quick-start','other',{timetableId:id.slot})).status).toBe(404);
    const response=await req('/sessions/quick-start','teacher',{timetableId:id.slot});expect(response.status).toBe(201);
    expect((await response.json()).data.session_id).toBe(sessionId);
    expect(await prisma.classSession.count({where:{timetable_id:id.slot,date:new Date('2026-10-23')}})).toBe(1);
  });
  it('debounces rapid scans, then records exit and later re-entry as separate intervals',async()=>{
    expect((await result(await tap())).outcome).toBe('DEBOUNCED');advance();expect((await result(await tap())).direction).toBe('OUT');
    let visits=await prisma.rfidVisit.findMany();expect(visits[0].exit_at?.getTime()).toBe(Date.now());
    advance();expect((await result(await tap())).direction).toBe('IN');visits=await prisma.rfidVisit.findMany();expect(visits).toHaveLength(2);expect(await prisma.attendance.count()).toBe(1);
  });
  it('shows private student times, the teacher’s full roster and no other student’s rows',async()=>{
    const day=await result(await req('/rfid/my-day','student'));expect(day.classes[0].roster).toHaveLength(1);expect(day.classes[0].roster[0].first_in).toBeTruthy();expect(day.classes[0].roster[0].last_out).toBeTruthy();
    expect(JSON.stringify(day)).not.toContain(second.student_id);
    expect((await result(await req('/rfid/day','teacher'))).classes[0].roster).toHaveLength(2);
    expect((await req('/sessions/'+sessionId,'other')).status).toBe(404);expect((await req('/attendance/session/'+sessionId,'other')).status).toBe(404);
  });
  it('counts same-day registration in the existing percentage service',async()=>{
    const summary=await result(await req(`/students/${student.student_id}/attendance/summary`,'student'));expect(summary.overall.eligible_sessions).toBe(1);expect(summary.overall.percentage).toBe(100);
  });
  it('rejects stale/future deliveries and unknown cards without fabricating attendance',async()=>{
    const count=await prisma.rfidVisit.count();expect((await result(await tap('AABBCCDD',randomUUID(),reader,Date.now()-31_000))).outcome).toBe('STALE_TAP');
    expect((await result(await tap('AABBCCDD',randomUUID(),reader,Date.now()+31_000))).outcome).toBe('STALE_TAP');expect((await result(await tap('FFFFFFFF'))).outcome).toBe('UNKNOWN_CARD');expect(await prisma.rfidVisit.count()).toBe(count);
  });
  it('does not accept a known card in the wrong room',async()=>{
    const r=await req('/rfid/readers','admin',{name:'Wrong room',room_no:'102'});otherReader=(await r.json()).data;
    expect((await result(await tap('AABBCCDD',randomUUID(),otherReader))).outcome).toBe('NO_CLASS');
  });
  it('revokes the old card and accepts a supervised replacement without losing history',async()=>{
    expect((await req(`/rfid/students/${student.student_id}/revoke-card`,'teacher',{reason:'lost card'})).status).toBe(403);
    expect((await req(`/rfid/students/${student.student_id}/revoke-card`,'admin',{reason:'lost card'})).status).toBe(200);
    expect((await result(await tap())).outcome).toBe('UNKNOWN_CARD');expect((await assign(student.student_id,'AABBCCEE')).status).toBe(200);
    advance();expect((await result(await tap('AABBCCEE'))).direction).toBe('OUT');expect(await prisma.rfidVisit.count()).toBe(2);
  });
  it('rejects closed sessions and preserves staff decisions when a tap is accepted',async()=>{
    await prisma.classSession.update({where:{session_id:sessionId},data:{status:'locked'}});advance();expect((await result(await tap('AABBCCEE'))).outcome).toBe('SESSION_CLOSED');
    await prisma.classSession.update({where:{session_id:sessionId},data:{status:'open'}});await prisma.attendance.updateMany({where:{session_id:sessionId,student_id:student.student_id},data:{status:'medical',method:'manual'}});
    advance();expect((await result(await tap('AABBCCEE'))).direction).toBe('IN');expect((await prisma.attendance.findFirstOrThrow({where:{student_id:student.student_id}})).status).toBe('medical');
  });
  it('rolls back visits and attendance if the event audit cannot be saved',async()=>{
    const eventId=randomUUID();await db.exec(`CREATE FUNCTION reject_rfid_audit() RETURNS trigger AS $$ BEGIN IF NEW.table_name = 'RfidEvent' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_rfid BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_rfid_audit();`);
    expect((await tap('11223344',eventId)).status).toBe(500);expect(await prisma.rfidEvent.count({where:{event_id:eventId}})).toBe(0);expect(await prisma.attendance.count({where:{student_id:second.student_id}})).toBe(0);
    await db.exec('DROP TRIGGER reject_rfid ON "AuditLog"; DROP FUNCTION reject_rfid_audit();');expect((await result(await tap('11223344',eventId))).direction).toBe('IN');
  });
  it('expires abandoned enrollment captures and suppresses attendance while capturing',async()=>{
    const capture=await result(await req(`/rfid/readers/${otherReader.reader_id}/capture`,'admin',{}));expect((await result(await tap('AABBCCEE',randomUUID(),otherReader))).outcome).toBe('CAPTURED');
    expect((await result(await tap('11223344',randomUUID(),otherReader))).outcome).toBe('CAPTURE_WAIT');advance(61);
    expect((await req('/rfid/cards/assign','admin',{captureId:capture.capture_id,studentId:student.student_id})).status).toBe(409);
  });
  it('rotates and disables reader keys immediately',async()=>{
    const old={...reader};reader=await result(await req(`/rfid/readers/${reader.reader_id}/rotate-key`,'admin',{}));expect((await tap('AABBCCEE',randomUUID(),old)).status).toBe(401);
    await req(`/rfid/readers/${reader.reader_id}`,'admin',{is_active:false},'PATCH');expect((await tap('AABBCCEE')).status).toBe(401);await req(`/rfid/readers/${reader.reader_id}`,'admin',{is_active:true},'PATCH');
    expect((await result(await tap('AABBCCEE'))).outcome).toBe('RECORDED');
  });
  it('validates dates and administrator timing policy',async()=>{
    expect((await req('/rfid/my-day?date=2026-02-31','student')).status).toBe(400);
    expect((await req('/rfid/policy','admin',{rfid_debounce_seconds:0,rfid_exit_grace_minutes:15,rfid_event_max_age_seconds:30},'PUT')).status).toBe(400);
  });
  it('deactivates leaving students and their cards/access while retaining historical records',async()=>{
    const before=await prisma.attendance.count({where:{student_id:student.student_id}}),visits=await prisma.rfidVisit.count({where:{student_id:student.student_id}});
    expect((await req(`/rfid/students/${student.student_id}/deactivate`,'admin',{reason:'left college'})).status).toBe(200);
    expect((await req('/rfid/my-day','student')).status).toBe(401);expect((await result(await tap('AABBCCEE'))).outcome).toBe('UNKNOWN_CARD');
    expect(await prisma.attendance.count({where:{student_id:student.student_id}})).toBe(before);expect(await prisma.rfidVisit.count({where:{student_id:student.student_id}})).toBe(visits);
    expect((await result(await req('/students','teacher'))).some((s:any)=>s.student_id===student.student_id)).toBe(false);
    expect((await result(await req('/rfid/day','teacher'))).classes[0].roster.some((s:any)=>s.student_id===student.student_id)).toBe(true);
  });
  it('imports unique initial logins, reports duplicates and creates section enrollments',async()=>{
    const body={sectionId:id.section,rows:[{name:'Imported one',email:'import1@test.invalid',roll_no:'IMP001'},{name:'Imported two',email:'import2@test.invalid',roll_no:'IMP002'},{name:'Duplicate',email:'import1@test.invalid',roll_no:'IMP003'}]};
    expect((await req('/rfid/students/import','teacher',body)).status).toBe(403);
    const response=await req('/rfid/students/import','admin',body);expect(response.status).toBe(201);expect(response.headers.get('cache-control')).toBe('no-store');
    const data=(await response.json()).data;expect(data.created).toBe(2);expect(data.results[2].ok).toBe(false);
    expect(data.results[0].initial_password).not.toBe(data.results[1].initial_password);
    const saved=await prisma.user.findUniqueOrThrow({where:{email:'import1@test.invalid'}});
    expect(await bcrypt.compare(data.results[0].initial_password,saved.password_hash)).toBe(true);
    expect(await prisma.enrollment.count({where:{student_id:data.results[0].student_id,subject_id:id.subject,status:'active'}})).toBe(1);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain(data.results[0].initial_password);
  });
  it('exports only authorized rows and neutralizes spreadsheet formulas',async()=>{
    await prisma.student.update({where:{student_id:second.student_id},data:{name:'=HYPERLINK("https://invalid")'}});
    const r=await req('/rfid/export','teacher'),csv=await r.text();expect(r.status).toBe(200);expect(r.headers.get('content-type')).toContain('text/csv');
    expect(csv).toContain("'=" );expect(csv).toContain('S002');
    expect(await (await req('/rfid/export','other')).text()).not.toContain('S002');
    expect((await req('/rfid/export','none')).status).toBe(401);
  });
  it('does not silently transfer a card captured concurrently on two readers',async()=>{
    const another=await newStudent('CONCURRENT');
    const a=await result(await req(`/rfid/readers/${reader.reader_id}/capture`,'admin',{}));
    const b=await result(await req(`/rfid/readers/${otherReader.reader_id}/capture`,'admin',{}));
    expect((await result(await tap('FACE0001',randomUUID(),reader))).outcome).toBe('CAPTURED');
    expect((await result(await tap('FACE0001',randomUUID(),otherReader))).outcome).toBe('CAPTURED');
    const replies=await Promise.all([req('/rfid/cards/assign','admin',{captureId:a.capture_id,studentId:second.student_id}),req('/rfid/cards/assign','admin',{captureId:b.capture_id,studentId:another.student_id})]);
    expect(replies.map(r=>r.status).sort()).toEqual([200,409]);
    expect(await prisma.rfidCard.count({where:{uid_suffix:'0001',is_active:true}})).toBe(1);
  });
  it('creates a timetable with assignment, rejects overlaps and rolls back invalid teacher accounts',async()=>{
    const body={subject_id:id.subject,section_id:id.section,teacher_id:id.teacher,day_of_week:'Mon',start_time:'10:00',end_time:'11:00',room_no:'101',session_type:'lecture'};
    expect((await req('/rfid/timetable','teacher',body)).status).toBe(403);
    expect((await req('/rfid/timetable','admin',body)).status).toBe(201);
    expect((await req('/rfid/timetable','admin',{...body,start_time:'10:30'})).status).toBe(409);
    expect((await req('/rfid/timetable','admin',{...body,section_id:id.otherSection})).status).toBe(400);
    expect((await req('/teachers','admin',{name:'No department',email:'no-dept@test.invalid',password,employee_id:'INVALID',department_id:randomUUID()})).status).toBe(500);
    expect(await prisma.user.count({where:{email:'no-dept@test.invalid'}})).toBe(0);
  });
});
