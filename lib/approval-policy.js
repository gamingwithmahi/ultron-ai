"use strict";
const crypto=require("node:crypto");
const DEFAULT_TTL_MS=7*24*60*60*1000;
const ACTION_TYPES=["send_message","publish_content","delete_data","financial_action","other"];
const RISKS=["low","medium","high","critical"];
function validateApprovalRequest(input){
 input=input&&typeof input==="object"?input:{};
 const title=typeof input.title==="string"?input.title.trim():"";
 const details=typeof input.details==="string"?input.details.trim():"";
 if(title.length<3||title.length>100)return{ok:false,error:"Title must be 3–100 characters"};
 if(details.length<3||details.length>1000)return{ok:false,error:"Details must be 3–1000 characters"};
 if(!ACTION_TYPES.includes(input.actionType)||!RISKS.includes(input.risk))return{ok:false,error:"Invalid action type or risk"};
 return{ok:true,value:{title,details,actionType:input.actionType,risk:input.risk}};
}
function requestDigest(value){
 const canonical={title:value.title,details:value.details,actionType:value.actionType,risk:value.risk};
 return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function createApprovalRecord(input,now=new Date()){
 const validation=validateApprovalRequest(input);
 if(!validation.ok)return validation;
 const value=validation.value,createdAt=now.toISOString();
 return{ok:true,value:{
  id:crypto.randomUUID(),...value,status:"pending",policyVersion:2,approvalRequired:true,
  executionEnabled:false,executionStatus:"not_executed",requestDigest:requestDigest(value),
  createdAt,expiresAt:new Date(now.getTime()+DEFAULT_TTL_MS).toISOString(),reviewedAt:null,reviewedBy:null
 }};
}
function reviewApproval(item,decision,now=new Date(),reviewedBy="operator"){
 if(!item||typeof item!=="object")return{ok:false,error:"Approval request not found",conflict:true};
 if(!["approved","rejected"].includes(decision))return{ok:false,error:"Decision must be approved or rejected"};
 if(item.status!=="pending")return{ok:false,error:"Request already reviewed",conflict:true};
 if(isExpired(item,now.getTime())){
  item.status="expired";item.expiredAt=now.toISOString();
  return{ok:false,error:"Approval request expired. Create a new request if still needed.",conflict:true,value:item};
 }
 if(item.policyVersion>=2){
  const actual=requestDigest(item);
  const expected=String(item.requestDigest||"");
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return{ok:false,error:"Approval request integrity check failed. This request cannot be approved.",conflict:true};
 }
 item.status=decision;item.reviewedAt=now.toISOString();item.reviewedBy=reviewedBy;
 if(decision==="approved")item.approvedAt=now.toISOString();
 if(decision==="rejected")item.rejectedAt=now.toISOString();
 item.executionEnabled=false;item.executionStatus="not_executed";
 return{ok:true,value:item};
}
function isExpired(item,now=Date.now()){
 if(!item||item.status!=="pending")return false;
 const created=Date.parse(item.createdAt||""),expires=Date.parse(item.expiresAt||"");
 const deadline=Number.isFinite(expires)?expires:Number.isFinite(created)?created+DEFAULT_TTL_MS:0;
 return deadline>0&&deadline<=now;
}
function expirePendingApprovals(items,now=Date.now()){
 const expired=[];
 for(const item of (Array.isArray(items)?items:[]))if(isExpired(item,now)){item.status="expired";item.expiredAt=new Date(now).toISOString();expired.push(item)}
 return expired;
}
module.exports={DEFAULT_TTL_MS,ACTION_TYPES,RISKS,validateApprovalRequest,createApprovalRecord,reviewApproval,requestDigest,isExpired,expirePendingApprovals};
