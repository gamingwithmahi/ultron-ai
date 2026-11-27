"use strict";

const TZ="Asia/Dhaka";
const DAY_MS=86400000;
const RULES=[
 {category:"security",priority:5,words:["security alert","suspicious sign-in","password reset","verify your account","unusual activity","compromised","two-factor"]},
 {category:"urgent",priority:5,words:["urgent","asap","immediately","deadline today","action required","overdue","final notice"]},
 {category:"finance",priority:4,words:["invoice","payment","receipt","billing","refund","subscription renewal","bank statement"]},
 {category:"work",priority:4,words:["project","proposal","client","deliverable","review","approval needed","meeting request","follow up"]},
 {category:"personal",priority:3,words:["family","personal","appointment","birthday","travel"]},
 {category:"updates",priority:2,words:["newsletter","weekly digest","product update","release notes","announcement","unsubscribe"]}
];
const URL_RE=/https?:\/\/[^\s<>()]+/gi;
function clean(value,max=180){return String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function classifyEmail(item={}){
 const subject=clean(item.subject,180),snippet=clean(item.snippet,260),from=clean(item.from,160),hay=(subject+" "+snippet+" "+from).toLowerCase();
 const rule=RULES.find(row=>row.words.some(word=>hay.includes(word)));
 const links=(subject+" "+snippet).match(URL_RE)||[];
 const attachmentHint=/\b(attachment|attached|document attached|view file|download file)\b/i.test(hay);
 const due=detectFollowUp(hay,item.date);
 const reasons=rule?rule.words.filter(word=>hay.includes(word)).slice(0,3):[];
 return {...item,subject,from,snippet,category:rule?rule.category:"general",priority:rule?rule.priority:3,priorityLabel:rule&&rule.priority===5?"critical":rule&&rule.priority===4?"high":rule&&rule.priority===3?"normal":"low",reasons,needsAttention:!!rule&&rule.priority>=4,linkCount:links.length,attachmentHint,reviewWarning:links.length||attachmentHint?"Review links/attachments carefully; ULTRON has not opened them.":null,followUp:due};
}
function detectFollowUp(text,reference){
 const base=reference&&Number.isFinite(Date.parse(reference))?new Date(reference):new Date();
 const lower=String(text||"").toLowerCase();
 let days=null;
 if(/\b(today|by end of day|eod)\b/.test(lower))days=0;
 else if(/\b(tomorrow|by tmrw)\b/.test(lower))days=1;
 else if(/\b(within\s+2\s+days|in\s+two\s+days)\b/.test(lower))days=2;
 else if(/\b(within\s+(\d{1,2})\s+days|in\s+(\d{1,2})\s+days)\b/.test(lower)){const m=lower.match(/(?:within|in)\s+(\d{1,2})\s+days/);days=Math.min(30,Number(m[1]));}
 else if(/\b(by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)){
  const names=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"],target=names.indexOf(lower.match(/\b(?:by|before)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)[1]);
  days=(target-base.getDay()+7)%7||7;
 }
 if(days===null)return null;
 const due=new Date(base.getTime()+days*DAY_MS);
 return {dueAt:due.toISOString(),daysFromReference:days,source:"heuristic"};
}
function classifyInbox(items=[]){
 const rows=(Array.isArray(items)?items:[]).map(classifyEmail);
 const order={critical:0,high:1,normal:2,low:3};
 rows.sort((a,b)=>order[a.priorityLabel]-order[b.priorityLabel]||Number(b.unread)-Number(a.unread));
 const counts=rows.reduce((acc,row)=>(acc[row.category]=(acc[row.category]||0)+1,acc),{});
 return {items:rows,counts,summary:{total:rows.length,critical:rows.filter(x=>x.priorityLabel==="critical").length,high:rows.filter(x=>x.priorityLabel==="high").length,unread:rows.filter(x=>x.unread).length,followUps:rows.filter(x=>x.followUp).length,linkWarnings:rows.filter(x=>x.reviewWarning).length}};
}
function localParts(date){
 const shifted=new Date(date.getTime()+6*60*60*1000);
 return {year:shifted.getUTCFullYear(),month:shifted.getUTCMonth(),day:shifted.getUTCDate(),weekday:shifted.getUTCDay()};
}
function localDateKey(parts){return [parts.year,String(parts.month+1).padStart(2,"0"),String(parts.day).padStart(2,"0")].join("-");}
function localIso(parts,hour,minute=0){return new Date(Date.UTC(parts.year,parts.month,parts.day,hour-6,minute)).toISOString();}
function findFocusSlots(events=[],{now=new Date(),durationMinutes=60,days=5,maxSlots=8}={}){
 const duration=Math.max(15,Math.min(240,Number(durationMinutes)||60)),horizon=Math.max(1,Math.min(14,Number(days)||5));
 const busy=[];
 for(const event of Array.isArray(events)?events:[]){
  if(event.start&&/^\d{4}-\d{2}-\d{2}$/.test(event.start)){const p=localParts(new Date(event.start+"T00:00:00+06:00"));busy.push({start:Date.UTC(p.year,p.month,p.day,3),end:Date.UTC(p.year,p.month,p.day+1,3)});continue;}
  const start=Date.parse(event.start||""),end=Date.parse(event.end||"");
  if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)busy.push({start,end});
 }
 const slots=[];
 for(let offset=0;offset<horizon&&slots.length<maxSlots;offset++){
  const p=localParts(new Date(now.getTime()+offset*DAY_MS));
  if(p.weekday===5||p.weekday===6)continue;
  for(let hour=9;hour<18&&slots.length<maxSlots;hour++){
   for(const minute of [0,30]){
    const start=Date.parse(localIso(p,hour,minute)),end=start+duration*60000;
    if(start<=now.getTime())continue;
    const endLocalHour=(hour*60+minute+duration)/60;
    if(endLocalHour>18)continue;
    if(busy.some(b=>start<b.end&&end>b.start))continue;
    slots.push({start:new Date(start).toISOString(),end:new Date(end).toISOString(),durationMinutes:duration,timezone:TZ,localLabel:localDateKey(p)+" "+String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0")});
    if(slots.length>=maxSlots)break;
   }
  }
 }
 return slots;
}
function meetingPrep({events=[],emails=[],memories=[],tasks=[],now=new Date(),limit=6}={}){
 const future=(Array.isArray(events)?events:[]).filter(e=>Date.parse(e.start||"")>=now.getTime()||/^\d{4}-\d{2}-\d{2}$/.test(e.start||"")).slice(0,limit);
 return future.map(event=>{
  const words=clean(event.summary||"",160).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3);
  const relatedEmails=(emails||[]).map(classifyEmail).filter(mail=>words.some(w=>(mail.subject+" "+mail.snippet).toLowerCase().includes(w))).slice(0,3).map(mail=>({subject:mail.subject,from:mail.from,priority:mail.priorityLabel}));
  const relatedMemories=(memories||[]).filter(m=>words.some(w=>(String(m.title||"")+" "+String(m.content||"")+" "+String((m.tags||[]).join(" "))).toLowerCase().includes(w))).slice(0,3).map(m=>({title:clean(m.title||m.category,100),category:clean(m.category,30)}));
  const relatedTasks=(tasks||[]).filter(t=>["queued","in_progress"].includes(t.status)&&words.some(w=>String(t.title||t.description||"").toLowerCase().includes(w))).slice(0,3).map(t=>clean(t.title||t.description,120));
  return {event:{id:event.id||null,summary:clean(event.summary,160),start:event.start||"",end:event.end||"",location:clean(event.location,140)},relatedEmails,relatedMemories,relatedTasks,agendaPrompts:["What outcome should this meeting produce?","Which decisions or blockers need attention?","Who owns each next step?"],readOnly:true};
 });
}
function prepareReplyDraft(item={}){
 const email=classifyEmail(item);
 return {subject:/^re:/i.test(email.subject)?email.subject:"Re: "+email.subject,body:"Hi "+(email.from.split("<")[0].trim()||"there")+",\n\nThanks for your message. I’ve reviewed the note and will follow up with the relevant details shortly.\n\nBest regards",status:"draft_suggestion_only",sendEnabled:false};
}
module.exports={classifyEmail,classifyInbox,detectFollowUp,findFocusSlots,meetingPrep,prepareReplyDraft,TZ};
