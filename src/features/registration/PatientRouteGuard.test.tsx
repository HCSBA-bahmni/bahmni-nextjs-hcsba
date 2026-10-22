import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {PatientRouteGuard} from './PatientRouteGuard';
const context=vi.hoisted(()=>({pathname:'/clinical/patient/[patientUuid]/dashboard',query:{patientUuid:'old',visitUuid:'visit-original'}}));
vi.mock('next/router',()=>({useRouter:()=>context}));
vi.mock('@/features/auth/AuthContext',()=>({useAuth:()=>({user:{uuid:'operator'},loading:false})}));
afterEach(()=>vi.unstubAllGlobals());
describe('patient route consolidation boundary',()=>{
  for(const pathname of ['/clinical/patient/[patientUuid]/dashboard','/clinical/patient/[patientUuid]/consultation/[board]','/orders/patient/[patientUuid]/fulfillment/[orderType]','/bedmanagement/patient/[patientUuid]','/clinical/programs/patient/[patientUuid]'])it(`does not mount retired chart consumers: ${pathname}`,async()=>{
    context.pathname=pathname;const consumer=vi.fn(()=> <div>Formulario clínico</div>);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({preferred_uuid:'current'}),{status:200,headers:{"content-type":"application/json"}})));
    const Consumer=consumer;
    render(<QueryClientProvider client={new QueryClient()}><PatientRouteGuard><Consumer/></PatientRouteGuard></QueryClientProvider>);
    const link=await screen.findByRole('link',{name:'Abrir ficha vigente'});
    expect(link.getAttribute('href')).toContain('patientUuid=current');
    expect(link.getAttribute('href')).toContain('visitUuid=visit-original');
    expect(consumer).not.toHaveBeenCalled();
  });
  it('mounts current chart only after the check completes',async()=>{
    context.pathname='/clinical/patient/[patientUuid]/dashboard';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:200,headers:{"content-type":"application/json"}})));
    render(<QueryClientProvider client={new QueryClient()}><PatientRouteGuard><div>Historia vigente</div></PatientRouteGuard></QueryClientProvider>);
    await waitFor(()=>expect(screen.getByText('Historia vigente')).toBeVisible());
  });
});
