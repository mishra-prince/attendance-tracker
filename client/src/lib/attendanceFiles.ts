import { Capacitor, registerPlugin } from '@capacitor/core';
const nativeFiles = registerPlugin<{ saveFile(options: { fileName: string; mimeType: string; base64: string }): Promise<void> }>('AttendanceFiles');
export async function saveAttendanceFile(blob: Blob, fileName: string) {
  if (Capacitor.getPlatform() === 'android') {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not prepare file')); reader.readAsDataURL(blob);
    });
    await nativeFiles.saveFile({ fileName, mimeType: blob.type.split(';')[0] || 'text/csv', base64 }); return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvValue(value: unknown) {
  const text = value == null ? '' : String(value), safe = /^\s*[=+@\-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function studentCsv(text: string) {
  if (text.length > 500_000) throw new Error('CSV is too large. Import up to 500 students at a time.');
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) { if(c==='"') { if(text[i+1]==='"') {cell+='"';i++;} else quoted=false; } else cell+=c; }
    else if(c==='"' && cell==='') quoted=true;
    else if(c===',') {row.push(cell);cell='';}
    else if(c==='\n' || c==='\r') {if(c==='\r' && text[i+1]==='\n') i++;row.push(cell);if(row.some((v)=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSV has an unclosed quote');row.push(cell);if(row.some((v)=>v.trim()))rows.push(row);
  const headers=rows.shift()?.map((h)=>h.trim()) || [], allowed=['name','email','roll_no','phone','parent_email','parent_phone'];
  if(!['name','email','roll_no'].every((h)=>headers.includes(h)) || headers.some((h)=>!allowed.includes(h)) || new Set(headers).size!==headers.length)
    throw new Error('Use template columns: name,email,roll_no,phone,parent_email,parent_phone');
  if(rows.length<1 || rows.length>500)throw new Error('Import between 1 and 500 completed student rows');
  return rows.map((r,i)=>{
    if(r.length!==headers.length)throw new Error(`Row ${i+2} does not match the header columns`);
    const item=Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]).filter(([h,v])=>v || ['name','email','roll_no'].includes(h)));
    if(!item.name || !item.email || !item.roll_no)throw new Error(`Row ${i+2}: name, email and roll number are required`);
    return item;
  });
}
