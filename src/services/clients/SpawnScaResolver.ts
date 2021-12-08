import * as path from "path";
import { exec, execFile, fork, spawn } from "child_process";


export class SpawnScaResolver {
    
    private static readonly SCA_RESOLVER_EXE= "ScaResolver.exe";
    private static readonly OFFLINE = "offline";

    /**
	 * This method executes
	 * @param pathToScaResolver - Path to SCA Resolver executable
	 * @param scaResolverAddParams - Additional parameters for SCA resolver
	 * @return
	 */
     static async  runScaResolver(pathToScaResolver:String, scaResolverAddParams: string,pathToResultJSONFile:string ):number {
      let exitCode:number = -100;
      let scaResolverCommand: Array<string>;
      let argument: Array<string>;

      //   Convert path and additional parameters into a single CMD command
      argument = scaResolverAddParams.split(" ");
      scaResolverCommand = new Array<string>(argument.length+2);
      scaResolverCommand[0] = pathToScaResolver + path.sep + SpawnScaResolver.SCA_RESOLVER_EXE;
      scaResolverCommand[1] = SpawnScaResolver.OFFLINE;
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
        scaResolverCommand[i+2] = arg;
        if(arg=="-r")
        {
            scaResolverCommand[i+3] = pathToResultJSONFile;
            i++;
        }
    }
    try{
        const execProcess = spawn('', scaResolverCommand);
        execProcess.stdout.on('data', (data) => {
            exitCode=Number(data);
        });
    }catch(err){
        throw Error(`Spawn process not working`);
    }
    return exitCode;    
}
   

}