import { expect, test, type Page, type Route } from "@playwright/test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const patient="11111111-1111-4111-8111-111111111111", actor="22222222-2222-4222-8222-222222222222", visit="33333333-3333-4333-8333-333333333333";
const stamp="2026-11-20T12:00:00Z",hash="a".repeat(64),sendId="44444444-4444-4444-8444-444444444444";
const source={system:"pabellon-hcsba-qa",environment:"qa-isolated",endpointEnvironment:"qa-isolated227",id:"110",observedAt:stamp,revision:hash};
const json=(route:Route,body:unknown,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body),headers:{"Cache-Control":"no-store"}});
const url=`/bahmni/clinical/patient/${patient}/dashboard?tab=pabellon&visitUuid=${visit}`;
function history() { return {schemaVersion:"2",patient:{uuid:patient,hisEnvironment:"bahmni225-dev",identityStatus:"matched",linkVersion:1},items:[{
 id:"110",source,requestSnapshot:{status:"available",snapshotId:"10",version:1,capturedAt:null},warningCodes:[],request:{contentSource:"request-snapshot",requestNumber:"261105001",origin:"normal",urgencyRequestComplete:null,patientAtRegistration:{givenNames:"PERSONA SINTETICA",familyName:"SNAPSHOT",secondFamilyName:null},specialty:null,plannedProcedures:null,diagnosis:"DIAGNOSTICO SINTETICO CONGELADO",duration:null,hospitalization:{value:false,provenance:"legacy-default"},admissionService:null,stateAtSnapshot:null,schedulesAtSnapshot:null}
 }],nextCursor:null,observedAt:stamp,correlationId:actor}; }
function protocols() { return {schemaVersion:"1",patient:{uuid:patient,hisEnvironment:"bahmni225-dev",identityStatus:"matched",linkVersion:1},surgeryId:"110",source:{...source,revision:null},families:[
 {family:"surgeon",status:"available",latestPublishedVersion:1,withheldVersions:0,warningCodes:[],versions:[{snapshotId:"201",protocolId:"101",version:1,amendment:false,contentSource:"protocol-snapshot",closedAt:{rawValue:"2026-11-20 09:00:00",sourceTimezone:null,normalizedInstant:null,interpretation:"unresolved"},capturedAt:null,digitalSignature:"not-established",sourceDataSHA256:hash,clinical:{patientAtRegistration:{givenNames:"PERSONA SINTETICA",familyName:"SNAPSHOT",secondFamilyName:null},diagnosis:null,surgicalDetail:"DETALLE SINTETICO",observations:null,surgeon:null,laterality:null,additionalProcedure:null,procedures:[],team:[]}}]},
 {family:"responsible",status:"no-published-versions",latestPublishedVersion:null,withheldVersions:0,warningCodes:[],versions:[]}],correlationId:actor}; }
async function setup(page:Page,{clinical=true,historyFailure=false,capability=true}={}) {
 const calls:Array<{path:string;method:string;body:unknown}>=[];
 await page.route("**/implementation_config/**",r=>json(r,{},404));
 await page.route("**/bahmni_config/**",r=>json(r,r.request().url().endsWith("/clinical/dashboard.json")?{pabellon:{translationKey:"Pabellón",displayByDefault:true,sections:{pabellon:{type:"pabellonHospitalario",title:"Pabellón hospitalario",displayOrder:0,requiredPrivilege:"app:clinical",config:{source:"qa-isolated"}}}}}:{}));
 await page.route(/\/openmrs\/(?:ws|pabellon-gateway)\//,r=>{
  const path=new URL(r.request().url()).pathname,method=r.request().method();
  if(path.includes("pabellon-gateway"))calls.push({path,method,body:r.request().postDataJSON()});
  if(path.endsWith("/session"))return json(r,{authenticated:true,user:{uuid:actor},sessionLocation:{uuid:"location",display:"QA"}});
  if(path.endsWith("/user"))return json(r,{results:[{uuid:actor,username:"QA",roles:[],privileges:clinical?[{name:"app:clinical"}]:[],userProperties:{defaultLocale:"es"}}]});
  if(path.endsWith("/provider"))return json(r,{results:[{uuid:"provider",display:"QA",attributes:[]}]});
  if(path.endsWith("/visitLocation/location"))return json(r,{uuid:"location",display:"QA"});
  if(path.endsWith(`/patientprofile/${patient}`))return json(r,{patient:{uuid:patient,identifiers:[{identifier:"SYN-PB-1",preferred:true}],person:{uuid:patient,display:"PERSONA SINTETICA ACTUAL",gender:"F",age:30,names:[{givenName:"PERSONA SINTETICA",familyName:"ACTUAL",preferred:true}],addresses:[],attributes:[]}}});
  if(path.endsWith("/visit"))return json(r,{results:[{uuid:visit,patient:{uuid:patient},voided:false,startDatetime:stamp,stopDatetime:null,location:{uuid:"location"},visitType:{display:"IPD"}}]});
  if(path.endsWith("/surgeries"))return json(r,historyFailure?{code:"SOURCE_UNAVAILABLE"}:history(),historyFailure?503:200);
  if(path.endsWith("/protocols"))return json(r,protocols());
  if(path.includes("/catalogues/")){
   const catalogue=path.split("/").at(-1);
   return json(r,capability?{catalogue,version:hash,items:[],nextCursor:null,observedAt:stamp,correlationId:actor}:{code:"SURGERY_READ_FORBIDDEN"},capability?200:403);
  }
  if(path.endsWith("/location"))return json(r,{results:[{uuid:"location",display:"QA"}]});
  if(method!=="GET")return json(r,{});
  return json(r,{results:[]});
 });
 return calls;
}

test("consulta snapshots y dibuja el PDF verificado con worker local",async({page},info)=>{
 await setup(page);
 const load=createRequire(resolve("package.json")),pdfMake=load("pdfmake/build/pdfmake.js");
 pdfMake.addVirtualFileSystem(load("pdfmake/build/vfs_fonts.js"));
 const pdf=await new Promise<Buffer>(resolve=>pdfMake.createPdf({content:["PROTOCOLO SINTETICO DE PRUEBA"]}).getBuffer(resolve));
 await page.route("**/pabellon-gateway/**/pdf",r=>r.fulfill({contentType:"application/pdf",body:pdf,headers:{"X-Pabellon-PDF-SHA256":createHash("sha256").update(pdf).digest("hex"),"X-Pabellon-Source-SHA256":hash,"X-Pabellon-Renderer":"b48-pabellon-protocolo-2026.10.29.1","Cache-Control":"no-store"}}));
 await page.goto(url);
 await page.getByRole("button",{name:"Ver solicitud",exact:true}).click();
 await expect(page.getByText("DIAGNOSTICO SINTETICO CONGELADO",{exact:true})).toBeVisible();
 await page.getByRole("dialog").getByRole("button",{name:"Close"}).click();
 await page.getByRole("button",{name:"Protocolos",exact:true}).click();
 await page.getByRole("button",{name:"Ver versión",exact:true}).click();
 await page.getByRole("button",{name:"Vista previa PDF",exact:true}).click();
 await expect(page.getByRole("img",{name:"Página 1 del PDF del protocolo"})).toBeVisible();
 await expect(page.getByText("Página 1 de 1",{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath("pabellon-pdf.png")});
});

test("recupera el mismo envío tras recarga sin reenviar datos clínicos",async({page})=>{
 const calls=await setup(page,{capability:false});
 await page.addInitScript(({actor,patient,visit,sendId})=>localStorage.setItem(`hcsba:pabellon:pending:v1:qa-isolated:${actor}:${patient}`,JSON.stringify({context:{actorUuid:actor,patientUuid:patient,visitUuid:visit,encounterUuid:"",sourceEnvironment:"qa-isolated"},sendId})),{actor,patient,visit,sendId});
 await page.route("**/pabellon-gateway/**/requests/recover",r=>{calls.push({path:new URL(r.request().url()).pathname,method:"POST",body:r.request().postDataJSON()});return json(r,{sendId,correlationId:actor,result:{surgeryId:"110",requestNumber:"261105001",stateAtCreation:1}});});
 await page.goto(url);
 await expect(page.getByRole("button",{name:"Verificar envío pendiente",exact:true}).first()).toBeVisible();
 await page.reload();
 await page.getByRole("button",{name:"Verificar envío pendiente",exact:true}).first().click();
 await page.getByRole("button",{name:"Verificar mismo envío",exact:true}).click();
 await expect(page.getByText("Solicitud registrada: 261105001",{exact:true})).toBeVisible();
 const posts=calls.filter(c=>c.method==="POST");expect(posts).toHaveLength(1);expect(posts[0]!.body).toEqual({sendId,visitUuid:visit,encounterUuid:""});
 expect(posts[0]!.path).toContain("/requests/recover");
 await expect.poll(()=>page.evaluate(({actor,patient})=>localStorage.getItem(`hcsba:pabellon:pending:v1:qa-isolated:${actor}:${patient}`),{actor,patient})).toBeNull();
});

test("conserva equipos e insumos opcionales vacíos y el control de kits",async({page})=>{
 const calls=await setup(page);await page.goto(url);
 await page.getByRole("button",{name:"Solicitar pabellón",exact:true}).first().click();
 const field=page.getByLabel("Insumos opcionales",{exact:true});
 await field.fill("");await expect(field).toHaveValue("");
 await page.getByLabel("Solicitar equipos médicos",{exact:true}).fill("");
 await expect(page.getByText("Solicitar Kit de Insumo",{exact:true})).toBeVisible();
 expect(calls.some(c=>c.method==="POST")).toBe(false);
});

test("un fallo de origen se muestra como error y permite reintentar",async({page})=>{
 const calls=await setup(page,{historyFailure:true,capability:false});await page.goto(url);
 await expect(page.getByRole("alert").filter({hasText:"Pabellón"}).first()).toBeVisible();
 await page.getByRole("button",{name:"Reintentar",exact:true}).click();
 await expect.poll(()=>calls.filter(c=>c.path.endsWith("/surgeries")).length).toBe(2);
 await expect(page.getByText("Sin solicitudes registradas para el paciente vinculado.")).toHaveCount(0);
});

test("un perfil sin permiso clínico no consulta el gateway",async({page})=>{
 const calls=await setup(page,{clinical:false});await page.goto(url);
 await expect(page.getByRole("alert").filter({hasText:"No tiene el privilegio app:clinical"})).toBeVisible();
 expect(calls).toEqual([]);
});
