import {expect,test,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const id="33333333-3333-4333-8333-333333333333";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
async function setup(page:Page,manager=true) {
  const requests:Array<{action:string;body:Record<string,unknown>}>=[];
  const json=(body:unknown)=>({contentType:"application/json",body:JSON.stringify(body)});
  const chart=(uuid:string,number:string)=>({uuid,names:[{given_name:"Persona",family_name:"Ensayo"}],identifiers:[{uuid:"id-"+number,identifier:number,type:"Patient Identifier",voided:false}]});
  const preview={preferred:chart(a,"HCSBA9001"),secondary:chart(b,"HCSBA9002"),fingerprint:"fresh-preview",blockers:[],counts:{visit:{preferred:1,secondary:1},allergy:{preferred:1,secondary:1},conditions:{preferred:1,secondary:1},obs:{preferred:1,secondary:1}}};
  const clinical={preferredUuid:a,secondaryUuid:b,operationId:"44444444-4444-4444-8444-444444444444",preview};
  const row={id,status:"clinical-review",version:1,patientUuid:a,patient:{name:[{given:["Persona"],family:"Ensayo"}]},requestedBy:"admisor",reason:"Revisar documentos de ensayo",createdAt:"2026-10-19T12:00:00Z",clinical};
  await page.route("**/openmrs/**",r=>r.fulfill({status:404,...json({})}));
  await page.route("**/openmrs/ws/rest/v1/session**",r=>r.fulfill(json({authenticated:true,user:{uuid:"user",display:"gestor"},sessionLocation:{uuid:"loc",display:"HCSBA"}})));
  await page.route("**/openmrs/ws/rest/v1/user**",r=>r.fulfill(json({results:[{uuid:"user",username:"gestor",privileges:[{name:"app:registration"},...(manager?[{name:"Manage MPI Identity Reviews"},{name:"Consolidate Patient Records"},{name:"Separate Patient Records"}]:[])],roles:[]}]})));
  for(const resource of ["provider","location"])await page.route(`**/openmrs/ws/rest/v1/${resource}**`,r=>r.fulfill(json({results:[{uuid:resource,display:"HCSBA",retired:false,attributes:[]}]})));
  await page.route("**/openmrs/mpi-admission-gateway/_identity",r=>r.fulfill(json({enabled:true,canManage:manager,identifierMap:[]})));
  await page.route("**/openmrs/mpi-admission-gateway/_reviews**",async r=>{
    if(r.request().method()==="GET")return r.fulfill(json({cases:[row]}));
    const action=r.request().url().split("/").at(-1)!;const body=r.request().postDataJSON();requests.push({action,body});
    if(action==="consolidate")row.status="consolidated";
    if(action==="separate")row.status="separated";
    const result={...row,clinical:action==="separation-prepare"?{...clinical,separation:{preferred:preview.preferred,secondary:preview.secondary,fingerprint:"fresh-separation",blockers:[],newRecords:[{key:"obs:new",category:"obs",description:"Peso: 72 kg"}]}}:clinical};
    return r.fulfill(json(result));
  });
  return requests;
}
test("gestor reviews both histories, consolidates and assigns later data before separating",async({page})=>{
  const requests=await setup(page);await page.goto("/bahmni/registration/reviews");
  await page.getByRole("button",{name:"Revisar consolidación",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Consolidar las fichas clínicas"});
  await expect(dialog.getByText("HCSBA9001",{exact:true})).toBeVisible();await expect(dialog.getByText("HCSBA9002",{exact:true})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Confirmar consolidación",exact:true})).toBeDisabled();
  await dialog.getByLabel("Motivo y evidencia de la decisión").fill("Cotejo documental presencial de ensayo");
  await dialog.getByLabel("Revisé las fichas, sus antecedentes y el efecto de esta operación.").check();
  expect((await new AxeBuilder({page}).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await dialog.getByRole("button",{name:"Confirmar consolidación",exact:true}).click();
  await expect(page.getByText("Historias clínicas consolidadas",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Revisar separación",exact:true}).click();
  const split=page.getByRole("dialog",{name:"Separar las fichas clínicas"});await expect(split.getByText("Peso: 72 kg",{exact:true})).toBeVisible();
  await split.getByLabel("Motivo y evidencia de la decisión").fill("Identidad distinta confirmada con documentos originales");
  await split.getByLabel("Revisé las fichas, sus antecedentes y el efecto de esta operación.").check();
  await expect(split.getByRole("button",{name:"Confirmar separación",exact:true})).toBeDisabled();
  await split.getByRole("combobox").selectOption("secondary");
  await split.getByRole("checkbox",{name:/También confirmé que son personas distintas/}).check();
  await split.getByRole("button",{name:"Confirmar separación",exact:true}).click();
  await expect(page.getByText(/Fichas separadas\. Se restituyeron/)).toBeVisible();
  const decision=requests.find(r=>r.action==="separate")!.body;
  expect(decision.assignments).toEqual({"obs:new":"secondary"});expect(decision.splitIdentity).toBe(true);
});
test("admission cannot access clinical consolidation actions",async({page})=>{
  const requests=await setup(page,false);await page.goto("/bahmni/registration/reviews");
  await expect(page.getByText("Acceso reservado al gestor de identidad")).toBeVisible();
  expect(requests).toEqual([]);
});
test("clinical comparison fits a narrow screen",async({page})=>{
  await page.setViewportSize({width:375,height:812});await setup(page);await page.goto("/bahmni/registration/reviews");
  await page.getByRole("button",{name:"Revisar consolidación",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);
});
