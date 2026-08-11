import { useRouter } from "next/router";
import { useEffect } from "react";
export default function IndexPage(){const router=useRouter();useEffect(()=>{void router.replace("/home");},[router]);return null;}
