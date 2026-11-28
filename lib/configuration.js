"use strict";
const GROUPS=[
{id:"core",label:"Core security & storage",items:[
{key:"ULTRON_SETUP_KEY",label:"First-run setup key",purpose:"One-time administrator initialization",required:true,secret:true},
{key:"ULTRON_SESSION_SECRET",label:"Session signing secret",purpose:"Signs secure operator sessions",required:true,secret:true},
{key:"DATABASE_URL",label:"PostgreSQL connection",purpose:"Durable state, sessions, approvals and OAuth storage",required:true,secret:true},
{key:"ULTRON_TOKEN_ENCRYPTION_KEY",label:"Token encryption key",purpose:"Encrypts Google OAuth tokens at rest",required:true,secret:true}]},
{id:"ai",label:"AI provider",items:[
{key:"OPENAI_API_KEY",label:"OpenAI API key",purpose:"Enables ULTRON Chat",required:false,secret:true},
{key:"OPENAI_MODEL",label:"OpenAI model",purpose:"Optional model override; default is gpt-6.2-astra",required:false,secret:false,defaultValue:"gpt-6.2-astra"}]},
{id:"voice",label:"ElevenLabs voice",items:[
{key:"ELEVENLABS_API_KEY",label:"ElevenLabs API key",purpose:"Server-side text-to-speech authentication",required:false,secret:true},
{key:"ELEVENLABS_VOICE_ID",label:"ElevenLabs voice ID",purpose:"Voice used for ULTRON speech output",required:false,secret:false},
{key:"ELEVENLABS_MODEL_ID",label:"ElevenLabs model",purpose:"Text-to-speech model; defaults to multilingual v2",required:false,secret:false,defaultValue:"eleven_multilingual_v2"}]},
{id:"google",label:"Google OAuth — active read-only connectors",items:[
{key:"GOOGLE_CLIENT_ID",label:"Google OAuth client ID",purpose:"Google consent and OAuth client identification",required:true,secret:false},
{key:"GOOGLE_CLIENT_SECRET",label:"Google OAuth client secret",purpose:"Server-side OAuth code exchange",required:true,secret:true},
{key:"GOOGLE_REDIRECT_URI",label:"Google OAuth redirect URI",purpose:"Must exactly match the Google Cloud OAuth client",required:true,secret:false}]},
{id:"youtube",label:"YouTube — planned connector",items:[
{key:"YOUTUBE_REDIRECT_URI",label:"YouTube OAuth redirect URI",purpose:"Future YouTube-specific callback; not consumed yet",required:false,secret:false}]},
{id:"whatsapp",label:"WhatsApp Business Cloud API — planned",items:[
{key:"META_APP_ID",label:"Meta app ID",purpose:"Future official Meta app registration",required:false,secret:false},
{key:"META_APP_SECRET",label:"Meta app secret",purpose:"Future webhook signature verification",required:false,secret:true},
{key:"WHATSAPP_ACCESS_TOKEN",label:"WhatsApp access token",purpose:"Future official Cloud API authorization",required:false,secret:true},
{key:"WHATSAPP_PHONE_NUMBER_ID",label:"WhatsApp phone number ID",purpose:"Future sending endpoint identifier",required:false,secret:false},
{key:"WHATSAPP_BUSINESS_ACCOUNT_ID",label:"WhatsApp business account ID",purpose:"Future business account reference",required:false,secret:false},
{key:"WHATSAPP_VERIFY_TOKEN",label:"Webhook verify token",purpose:"Future Meta webhook challenge verification",required:false,secret:true}]}
];
function buildConfigurationReport(env=process.env){
 const groups=GROUPS.map(group=>{const items=group.items.map(item=>{
  const value=typeof env[item.key]==="string"?env[item.key].trim():"";
  const configured=value.length>0&&!/^replace-with-|^YOUR-/i.test(value);
  return{key:item.key,label:item.label,purpose:item.purpose,configured:configured||(!value&&!!item.defaultValue),required:item.required,secret:item.secret,status:configured?"configured":item.defaultValue?"defaulted":"missing",...(item.defaultValue?{defaultValue:item.defaultValue}:{})};
 });return{id:group.id,label:group.label,total:items.length,configured:items.filter(x=>x.configured).length,items};});
 const items=groups.flatMap(group=>group.items);
 return{generatedAt:new Date().toISOString(),groups,total:items.length,configured:items.filter(x=>x.configured).length,requiredMissing:items.filter(x=>x.required&&!x.configured).map(x=>x.key),secretValuesExposed:false};
}
module.exports={buildConfigurationReport};
