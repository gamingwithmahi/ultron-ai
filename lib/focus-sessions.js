"use strict";
const crypto=require("node:crypto");
const ACTIVE=["running","paused"];
const STATUSES=["running","paused","completed","cancelled"];
function clean(value,max){return String(value||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function elapsedSeconds(session,now=new Date()){
 const base=Number(session.elapsedSeconds)||0;
 if(session.status!=="running"||!session.startedAt)return base;
 const delta=Math.max(0,Math.floor((now.getTime()-Date.parse(session.startedAt))/1000));
 return base+(Number.isFinite(delta)?delta:0);
}
function createSession(input={},tasks=[],now=new Date()){
 const title=clean(input.title,120),taskId=input.taskId?String(input.taskId):null;
 const targetMinutes=input.targetMinutes===undefined?25:Number(input.targetMinutes);
 if(title.length<3)return{error:"Focus title must be 3–120 characters"};
 if(!Number.isInteger(targetMinutes)||targetMinutes<5||targetMinutes>180)return{error:"Focus duration must be 5–180 minutes"};
 if(taskId&&!tasks.some(t=>t.id===taskId&&["queued","in_progress"].includes(t.status)))return{error:"Choose an active task"};
 return{value:{id:crypto.randomUUID(),title,taskId,targetMinutes,elapsedSeconds:0,status:"running",startedAt:now.toISOString(),pausedAt:null,completedAt:null,cancelledAt:null,createdAt:now.toISOString(),updatedAt:now.toISOString(),segments:[{startedAt:now.toISOString(),endedAt:null}],notes:clean(input.notes,500)}}}
function transitionSession(session,action,now=new Date()){
 if(!session)return{error:"Focus session not found"};
 if(!["pause","resume","complete","cancel"].includes(action))return{error:"Unsupported focus action"};
 if(!ACTIVE.includes(session.status))return{error:"Focus session is already finalized"};
 const at=now.toISOString(),next={...session,segments:[...(session.segments||[])]};
 if(action==="pause"){
  if(session.status!=="running")return{error:"Session is not running"};
  next.elapsedSeconds=elapsedSeconds(session,now);next.status="paused";next.pausedAt=at;next.startedAt=null;
  const last=next.segments[next.segments.length-1];if(last&&!last.endedAt)last.endedAt=at;
 }else if(action==="resume"){
  if(session.status!=="paused")return{error:"Session is not paused"};
  next.status="running";next.startedAt=at;next.pausedAt=null;next.segments.push({startedAt:at,endedAt:null});
 }else if(action==="complete"){
  if(session.status==="running")next.elapsedSeconds=elapsedSeconds(session,now);
  next.status="completed";next.completedAt=at;next.startedAt=null;
  const last=next.segments[next.segments.length-1];if(last&&!last.endedAt)last.endedAt=at;
 }else{
  if(session.status==="running")next.elapsedSeconds=elapsedSeconds(session,now);
  next.status="cancelled";next.cancelledAt=at;next.startedAt=null;
  const last=next.segments[next.segments.length-1];if(last&&!last.endedAt)last.endedAt=at;
 }
 next.updatedAt=at;return{value:next};
}
function presentSession(session,now=new Date()){
 const elapsed=elapsedSeconds(session,now),target=session.targetMinutes*60;
 return{...session,elapsedSeconds:elapsed,remainingSeconds:Math.max(0,target-elapsed),progressPercent:Math.min(100,Math.round(elapsed/target*100)),targetReached:elapsed>=target};
}
function summarizeSessions(sessions=[],now=new Date()){
 const today=now.toISOString().slice(0,10),todayRows=sessions.filter(s=>(s.completedAt||s.createdAt||"").slice(0,10)===today),completed=sessions.filter(s=>s.status==="completed");
 const totalSeconds=sessions.reduce((n,s)=>n+(s.status==="running"?elapsedSeconds(s,now):Number(s.elapsedSeconds)||0),0);
 const todaySeconds=todayRows.reduce((n,s)=>n+(s.status==="running"?elapsedSeconds(s,now):Number(s.elapsedSeconds)||0),0);
 const byDay={};for(const s of sessions){const day=(s.completedAt||s.createdAt||"").slice(0,10);if(day)byDay[day]=(byDay[day]||0)+(s.status==="running"?elapsedSeconds(s,now):Number(s.elapsedSeconds)||0)}
 return{summary:{total:sessions.length,completed:completed.length,running:sessions.filter(s=>s.status==="running").length,paused:sessions.filter(s=>s.status==="paused").length,todaySessions:todayRows.length,todayMinutes:Math.floor(todaySeconds/60),totalMinutes:Math.floor(totalSeconds/60),averageCompletedMinutes:completed.length?Math.round(completed.reduce((n,s)=>n+(Number(s.elapsedSeconds)||0),0)/completed.length/60):0},daily:Object.entries(byDay).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([date,seconds])=>({date,minutes:Math.floor(seconds/60)})),sessions:sessions.slice(0,100).map(s=>presentSession(s,now))};
}
module.exports={ACTIVE,STATUSES,elapsedSeconds,createSession,transitionSession,presentSession,summarizeSessions};
