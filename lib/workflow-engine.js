"use strict";
const crypto=require("node:crypto");
const TZ="Asia/Dhaka";
const TEMPLATES=Object.freeze({
 daily_briefing:{title:"Daily Command Briefing",description:"A structured operator-led daily review.",steps:["Review critical inbox metadata","Check today's calendar and conflicts","Review active tasks and priorities","Inspect pending approvals","Choose the three most important outcomes"]},
 weekly_review:{title:"Weekly Operations Review",description:"Review progress and prepare the coming week.",steps:["Review completed and overdue tasks","Review upcoming calendar commitments","Inspect important project memories","Review pending approvals and risks","Set priorities for the next week"]},
 inbox_zero:{title:"Inbox Triage Session",description:"Triage message metadata without sending or deleting email.",steps:["Review critical and high-priority messages","Identify messages needing follow-up","Review suspicious link and attachment warnings","Prepare reply drafts for operator review","Record follow-up tasks manually"]},
 project_launch:{title:"Project Launch Checklist",description:"A safe, operator-controlled launch readiness checklist.",steps:["Confirm scope and success criteria","Review dependencies and risks","Verify security and access controls","Complete launch readiness checks","Record approval and post-launch review plan"]}
});
function clean(v,max){return String(v||"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}
function createReminder(input={},now=new Date()){
 const title=clean(input.title,120),notes=clean(input.notes,500),dueAt=String(input.dueAt||"");
 if(title.length<3)return {error:"Reminder title must be 3–120 characters"};
 if(!Number.isFinite(Date.parse(dueAt)))return {error:"A valid reminder date and time is required"};
 if(input.recurrence&&!["none","daily","weekly"].includes(input.recurrence))return {error:"Unsupported recurrence"};
 return {value:{id:crypto.randomUUID(),title,notes,dueAt:new Date(dueAt).toISOString(),timezone:TZ,recurrence:input.recurrence||"none",status:"active",createdAt:now.toISOString(),updatedAt:now.toISOString(),completedAt:null,snoozeCount:0}};
}
function summarizeReminders(items=[],now=new Date()){
 const rows=items.filter(x=>x.status==="active").map(x=>({...x,overdue:Date.parse(x.dueAt)<now.getTime(),dueSoon:Date.parse(x.dueAt)>=now.getTime()&&Date.parse(x.dueAt)<=now.getTime()+86400000}));
 return {items:rows.sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt)).slice(0,100),summary:{active:rows.length,overdue:rows.filter(x=>x.overdue).length,dueSoon:rows.filter(x=>x.dueSoon).length,completed:items.filter(x=>x.status==="completed").length}};
}
function createWorkflow(input={},now=new Date()){
 const template=TEMPLATES[input.template];
 if(!template)return {error:"Choose a supported workflow template"};
 const steps=template.steps.map((title,index)=>({id:String(index+1),title,status:"pending",completedAt:null}));
 return {value:{id:crypto.randomUUID(),template:input.template,title:clean(input.title||template.title,120),description:template.description,status:"active",steps,currentStep:0,createdAt:now.toISOString(),updatedAt:now.toISOString(),completedAt:null,executionMode:"operator_checklist",externalActionsEnabled:false}};
}
function updateWorkflowStep(workflow,stepId,status,now=new Date()){
 if(!workflow||workflow.status!=="active")return {error:"Only active workflows can be updated"};
 if(!["pending","in_progress","completed","skipped"].includes(status))return {error:"Invalid workflow step status"};
 const step=workflow.steps.find(x=>x.id===String(stepId));
 if(!step)return {error:"Workflow step not found"};
 const index=workflow.steps.indexOf(step);
 if(status!=="pending"&&workflow.steps.slice(0,index).some(x=>x.status==="pending"||x.status==="in_progress"))return {error:"Complete or skip earlier steps first"};
 step.status=status;step.completedAt=status==="completed"?now.toISOString():null;
 workflow.currentStep=workflow.steps.findIndex(x=>x.status==="pending"||x.status==="in_progress");
 if(workflow.currentStep<0)workflow.currentStep=workflow.steps.length;
 if(workflow.steps.every(x=>["completed","skipped"].includes(x.status))){workflow.status="completed";workflow.completedAt=now.toISOString()}
 workflow.updatedAt=now.toISOString();
 return {value:workflow};
}
function setWorkflowStatus(workflow,status,now=new Date()){
 if(!workflow||!["active","paused","cancelled"].includes(workflow.status))return {error:"Workflow is already finalized"};
 if(!["active","paused","cancelled"].includes(status))return {error:"Invalid workflow status"};
 workflow.status=status;workflow.updatedAt=now.toISOString();
 return {value:workflow};
}
function buildOperationsSnapshot({reminders=[],workflows=[],tasks=[],now=new Date()}={}){
 const reminder=summarizeReminders(reminders,now),activeWorkflows=workflows.filter(x=>x.status==="active");
 const dueTasks=tasks.filter(x=>["queued","in_progress"].includes(x.status));
 return {generatedAt:now.toISOString(),timezone:TZ,reminders:reminder.summary,workflows:{active:activeWorkflows.length,paused:workflows.filter(x=>x.status==="paused").length,completed:workflows.filter(x=>x.status==="completed").length,stepsRemaining:activeWorkflows.reduce((n,w)=>n+w.steps.filter(s=>s.status==="pending"||s.status==="in_progress").length,0)},tasks:{active:dueTasks.length,highPriority:dueTasks.filter(t=>t.priority==="high").length},nextReminder:reminder.items[0]||null,externalActionsEnabled:false};
}
module.exports={TZ,TEMPLATES,createReminder,summarizeReminders,createWorkflow,updateWorkflowStep,setWorkflowStatus,buildOperationsSnapshot};
