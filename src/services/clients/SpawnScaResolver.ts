import * as path from "path";
import {spawn } from "child_process";


export class SpawnScaResolver {
    
    private static readonly SCA_RESOLVER_EXE= "ScaResolver";
    private static readonly OFFLINE = "offline";

    /**
	 * This method executes
	 * @param pathToScaResolver - Path to SCA Resolver executable
	 * @param scaResolverAddParams - Additional parameters for SCA resolver
	 * @return
	 */
     static async runScaResolver(pathToScaResolver:string, scaResolverAddParams: string,pathToResultJSONFile:string ):Promise<number> {
      let exitCode:number = -100;
      let scaResolverCommand: string;
      let argument: Array<string>;

      //   Convert path and additional parameters into a single CMD command
      argument = scaResolverAddParams.split(" ");
      scaResolverCommand = pathToScaResolver + path.sep + SpawnScaResolver.SCA_RESOLVER_EXE;
      scaResolverCommand = scaResolverCommand + " " + SpawnScaResolver.OFFLINE;
      for  (let i:number = 0 ; i < argument.length ; i++){
        let arg: string  = argument[i];
        if(arg=="debug")
        {
            arg = "Debug";
        }
        if(arg=="error")
        {
            arg = "Error";
        }
        scaResolverCommand = scaResolverCommand + " " + arg;
        if(arg=="-r")
        {
            scaResolverCommand =scaResolverCommand + " " + pathToResultJSONFile;
        }
    }

    try{
        const child = spawn(scaResolverCommand, [''], {shell: true});
        exitCode = await new Promise( (resolve, reject) => {
            child.on('close', resolve);
        });
    
        if( exitCode) {
            throw new Error( `subprocess error exit ${exitCode}`);
        }
        
    }catch(err){
        throw Error(`Spawn process not working`);
    }
    return exitCode;    
}
   

}