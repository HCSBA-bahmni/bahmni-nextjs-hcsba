import type { NextApiRequest, NextApiResponse } from "next";
export default function handler(_request:NextApiRequest,response:NextApiResponse){response.status(200).json({status:"ok",service:"bahmni-next-web",version:process.env.npm_package_version??"0.1.0-rc.0"});}
