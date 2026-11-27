"use strict";
const DEFAULT_TTL_MS=7*24*60*60*1000;
const ACTION_TYPES=["send_message","publish_content","delete_data","financial_action","other"];
const RISKS=["low","medium","high","critical"];
function validateApprovalRequest(input){
 const title=typeof input.title==="string"?input.title.trim():"";
 const details=typeof input.details==="string"?input.details.trim():"";
 if(title.length<3||title.length>100)return{ok:false,error:"Title must be 3–100 characters"};
 if(details.length<3||details.length>1000)return{ok:false,error:"Details must be 3–1000 characters"};
 if(!ACTION_TYPES.includes(input.actionType)||!RISKS.includes(input.risk))return{ok:false,error:"Invalid action type or risk"};
 return{ok:true,value:{title,details,actionType:input.actionType,risk:input.risk}};
}
function isExpired(item,now=Date.now()){
 if(item.status!=="pending")return false;
 const created=Date.parse(item.createdAt||""),expires=Date.parse(item.expiresAt||"");
 const deadline=Number.isFinite(expires)?expires:Number.isFinite(created)?created+DEFAULT_TTL_MS:0;
 return deadline>0&&deadline<=now;
}
function expirePendingApprovals(items,now=Date.now()){
 const expired=[];
 for(const item of items||[])if(isExpired(item,now)){item.status="expired";item.expiredAt=new Date(now).toISOString();expired.push(item)}
 return expired;
}
module.exports={DEFAULT_TTL_MS,ACTION_TYPES,RISKS,validateApprovalRequest,isExpired,expirePendingApprovals};
