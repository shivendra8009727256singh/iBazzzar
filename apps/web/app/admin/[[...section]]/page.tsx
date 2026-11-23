import {AdminConsole} from '@/components/admin/console';
export const metadata={title:'Admin console',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{section?:string[]}>}){const {section}=await params;return <AdminConsole section={section?.[0]??null}/>;}
