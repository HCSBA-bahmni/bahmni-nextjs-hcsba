import {test,expect,type Page} from '@playwright/test';
const old='22222222-2222-4222-8222-222222222222',current='11111111-1111-4111-8111-111111111111';
async function setup(page:Page){
 const json=(body:unknown)=>({contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/openmrs/**',r=>r.fulfill({status:404,...json({})}));
 await page.route('**/openmrs/ws/rest/v1/session**',r=>r.fulfill(json({authenticated:true,user:{uuid:'user',display:'gestor'},sessionLocation:{uuid:'location',display:'HCSBA'}})));
 await page.route('**/openmrs/ws/rest/v1/user**',r=>r.fulfill(json({results:[{uuid:'user',username:'gestor',privileges:['app:clinical','app:orders','app:adt'].map(name=>({name})),roles:[]}]})));
 await page.route('**/openmrs/ws/rest/v1/provider**',r=>r.fulfill(json({results:[{uuid:'provider',retired:false,attributes:[]}]})));
 await page.route('**/openmrs/ws/rest/v1/location**',r=>r.fulfill(json({results:[{uuid:'location',display:'HCSBA'}]})));
 await page.route('**/openmrs/ws/rest/v1/eisidentity/consolidations/redirect?**',r=>r.fulfill(json({preferred_uuid:current})));
 const reads:string[]=[];
 await page.route('**/openmrs/ws/rest/v1/patientprofile/**',r=>{reads.push(r.request().url());return r.fulfill({status:404,...json({})});});
 return reads;
}
for(const route of [`/clinical/patient/${old}/dashboard?visitUuid=original-visit`,`/orders/patient/${old}/fulfillment/Lab`,`/bedmanagement/patient/${old}`])test(`retired chart is checked before mounting consumers: ${route}`,async({page})=>{
 const reads=await setup(page);await page.goto('/bahmni'+route);
 await expect(page.getByRole('heading',{name:'Esta ficha fue incorporada a otra ficha vigente'})).toBeVisible();
 const target=await page.getByRole('link',{name:'Abrir ficha vigente',exact:true}).getAttribute('href');
 expect(target).toContain(current);expect(target).not.toContain(old);
 if(route.includes('visitUuid'))expect(target).toContain('visitUuid=original-visit');
 expect(reads).toEqual([]);
});
