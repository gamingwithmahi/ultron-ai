"use strict";
const crypto=require("node:crypto");
const PRIORITY={critical:100,high:70,normal:40,low:15};
const CATEGORIES=["work","personal","study","finance","health","project","other"];
function clean(v,max){return String(v||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function createTask(input={},existing=[],now=new Date()){
 const title=clean(input.title,120),details=clean(input.details,1500),priority=input.priority||"normal",category=input.category||"other";
 if(title.length<3)return{error:"Task title must be 3–120 characters"};
 if(!["low","normal","high","critical"].includes(priority))return{error:"Invalid task priority"};
 if(!CATEGORIES.includes(category))return{error:"Invalid task category"};
 const estimate=input.estimateMinutes===undefined||input.estimateMinutes===""?null:Number(input.estimateMinutes);
 if(estimate!==null&&(!Number.isInteger(estimate)||estimate<5||estimate>1440))return{error:"Estimate must be 5–1440 minutes"};
 const dueAt=input.dueAt?new Date(input.dueAt):null;
 if(input.dueAt&&(!Number.isFinite(dueAt.getTime())))return{error:"Invalid task due date"};
 let dependsOn=input.dependsOn||[];
 if(typeof dependsOn==="string")dependsOn=dependsOn.split(",").map(x=>x.trim()).filter(Boolean);
 if(!Array.isArray(dependsOn)||dependsOn.length>5||dependsOn.some(x=>typeof x!=="string"))return{error:"A task may depend on up to five existing tasks"};
 dependsOn=[...new Set(dependsOn)];
 if(dependsOn.some(id=>!existing.some(t=>t.id===id&&t.status!=="cancelled")))return{error:"Dependencies must reference existing, non-cancelled tasks"};
 return{value:{id:crypto.randomUUID(),title,details,priority,category,estimateMinutes:estimate,dueAt:dueAt?dueAt.toISOString():null,dependsOn,status:"queued",createdAt:now.toISOString(),updatedAt:now.toISOString(),completedAt:null}}}
function dependencyState(task,tasks=[]){const deps=(task.dependsOn||[]).map(id=>tasks.find(t=>t.id===id)).filter(Boolean);return{dependencies:deps.map(t=>({id:t.id,title:t.title,status:t.status})),blocked:deps.some(t=>t.status!=="completed"),missing:(task.dependsOn||[]).filter(id=>!tasks.some(t=>t.id===id))}}
function scoreTask(task,tasks=[],now=new Date()){
 const due=task.dueAt?Date.parse(task.dueAt):NaN,late=Number.isFinite(due)&&due<now.getTime(),hours=Number.isFinite(due)?(due-now.getTime())/3600000:Infinity,state=dependencyState(task,tasks);let score=PRIORITY[task.priority]||40;
 if(late)score+=55;else if(hours<=24)score+=35;else if(hours<=72)score+=18;if(state.blocked)score-=35;if(task.status==="in_progress")score+=8;
 return{score,overdue:late,dueSoon:!late&&hours<=24,blocked:state.blocked,dependencies:state.dependencies,missingDependencies:state.missing}}
function rankTasks(tasks=[],now=new Date()){return tasks.map(t=>({...t,...scoreTask(t,tasks,now)})).sort((a,b)=>b.score-a.score||((a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity))||Date.parse(a.createdAt)-Date.parse(b.createdAt))}
function summarizeTasks(tasks=[],now=new Date()){
 const active=tasks.filter(t=>["queued","in_progress"].includes(t.status)),ranked=rankTasks(active,now),history=tasks.filter(t=>["completed","cancelled"].includes(t.status)).sort((a,b)=>Date.parse(b.updatedAt||b.createdAt)-Date.parse(a.updatedAt||a.createdAt));
 return{tasks:[...ranked,...history].slice(0,200),summary:{total:tasks.length,active:active.length,queued:active.filter(t=>t.status==="queued").length,inProgress:active.filter(t=>t.status==="in_progress").length,completed:tasks.filter(t=>t.status==="completed").length,cancelled:tasks.filter(t=>t.status==="cancelled").length,overdue:ranked.filter(t=>t.overdue).length,dueSoon:ranked.filter(t=>t.dueSoon).length,blocked:ranked.filter(t=>t.blocked).length,highPriority:ranked.filter(t=>["high","critical"].includes(t.priority)).length}}}
function validateTaskUpdate(task,input,tasks=[],now=new Date()){
 if(!task)return{error:"Task not found"};if(["completed","cancelled"].includes(task.status))return{error:"Finalized tasks cannot be changed"};const patch={};
 if(input.status!==undefined){if(!["queued","in_progress","completed","cancelled"].includes(input.status))return{error:"Invalid task status"};if(input.status==="completed"&&dependencyState(task,tasks).blocked)return{error:"Complete prerequisite tasks before completing this task"};patch.status=input.status;if(input.status==="completed")patch.completedAt=now.toISOString()}
 if(input.priority!==undefined){if(!["low","normal","high","critical"].includes(input.priority))return{error:"Invalid task priority"};patch.priority=input.priority}
 if(input.category!==undefined){if(!CATEGORIES.includes(input.category))return{error:"Invalid task category"};patch.category=input.category}
 if(input.dueAt!==undefined){if(input.dueAt===null||input.dueAt==="")patch.dueAt=null;else if(!Number.isFinite(Date.parse(input.dueAt)))return{error:"Invalid task due date"};else patch.dueAt=new Date(input.dueAt).toISOString()}
 if(input.estimateMinutes!==undefined){const n=input.estimateMinutes===""||input.estimateMinutes===null?null:Number(input.estimateMinutes);if(n!==null&&(!Number.isInteger(n)||n<5||n>1440))return{error:"Estimate must be 5–1440 minutes"};patch.estimateMinutes=n}
 if(input.dependsOn!==undefined){let deps=input.dependsOn;if(typeof deps==="string")deps=deps.split(",").map(x=>x.trim()).filter(Boolean);if(!Array.isArray(deps)||deps.length>5||deps.includes(task.id)||deps.some(id=>!tasks.some(t=>t.id===id&&t.status!=="cancelled")))return{error:"Dependencies must be up to five existing tasks and cannot include this task"};const unique=[...new Set(deps)];const reaches=(id,seen=new Set())=>{if(id===task.id)return true;if(seen.has(id))return false;seen.add(id);const node=tasks.find(t=>t.id===id);return !!node&&(node.dependsOn||[]).some(parent=>reaches(parent,seen))};if(unique.some(id=>reaches(id)))return{error:"Dependency cycle detected"};patch.dependsOn=unique}
 if(!Object.keys(patch).length)return{error:"No supported task changes supplied"};return{value:{...task,...patch,updatedAt:now.toISOString()}}}
module.exports={CATEGORIES,createTask,dependencyState,scoreTask,rankTasks,summarizeTasks,validateTaskUpdate};
