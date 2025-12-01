import * as path from "path";
import {spawn } from "child_process";
import { Logger } from '../logger';

export class SpawnScaResolver {
    
    private static readonly SCA_RESOLVER_EXE= "ScaResolver";
    private static readonly OFFLINE = "offline";    
    
    /**
	 * This method executes
	 * @param pathToScaResolver - Path to SCA Resolver executable
	 * @param scaResolverAddParams - Additional parameters for SCA resolver
	 * @return
	 */
     static async runScaResolver(pathToScaResolver:string, scaResolverAddParams: string,pathToResultJSONFile:string, pathToSASTResultJSONFile:string,  log: Logger):Promise<number> {
      let exitCode:number = -100;
      let scaResolverCommand: string;
      let argument: Array<string>;
      let scanContainers = false;          // whether container scan enabled
      let containerResultPath: string = ""; // path to container result JSON


      //   Convert path and additional parameters into a single CMD command
      argument = scaResolverAddParams.split(" ");
      scaResolverCommand = pathToScaResolver + path.sep + SpawnScaResolver.SCA_RESOLVER_EXE;
      scaResolverCommand = scaResolverCommand + " " + SpawnScaResolver.OFFLINE;
      for(let i=0; i<argument.length;i++){
        let arg: string  = argument[i];        
        scaResolverCommand = scaResolverCommand + " " + arg;
        if(arg=="-r" || arg == "--resolver-result-path")
        {
            scaResolverCommand =scaResolverCommand + " " +pathToResultJSONFile;
            i=i+1;
        }else if(arg=="--sast-result-path")
        {
            scaResolverCommand =scaResolverCommand + " " +pathToSASTResultJSONFile;
            i=i+1;
        }
        else if (arg === "--scan-containers") {
          scanContainers = true;
        }
        else if (arg === "--containers-result-path") {
          containerResultPath = argument[i + 1];
          scaResolverCommand += " " + containerResultPath;
          i++;
        }
      }


    try{
        let errorOccured = '';
        const child = spawn(scaResolverCommand, [''], {shell: true});
        log.debug("Performing SCA scan through SCA Resolver.");
        exitCode = await new Promise( (resolve, reject) => {
            child.stdout.on("data", (x: any) => {
              var data = x.toString();
              data = data.replace(/(\r\n|\n|\r)/gm, "");
              if(data !='' || data !=' ' ) {
                log.debug(data);   
              }             
              });
            
            child.stderr.on("data", (x: any) => {                                       
                errorOccured = x.toString();  
                errorOccured = errorOccured.replace(/(\r\n|\n|\r)/gm, "");  
                if(errorOccured.includes('Permission denied') || errorOccured.includes('Access is denied'))            
                {
                  log.debug('Access was denied while attempting to execute the SCA Resolver command: ' + scaResolverCommand);
                }
                else if(errorOccured !='')
                {
                 log.debug('Error occurred while running SCA Resolver:' + errorOccured); 
                }                       
              });

              child.on('error', (err: any) => { 
                if(errorOccured.includes('Permission denied') || errorOccured.includes('Access is denied'))            
                {
                  log.debug(`Access was denied while attempting to execute the SCA Resolver command:  ${scaResolverCommand}`); 
                  throw new Error(`Access was denied while attempting to execute the SCA Resolver command: ` + scaResolverCommand);
                }
                else
                {
                  log.debug(`Error occurred while running SCA Resolver:  ${err}`); 
                  throw new Error(`Error occurred while running SCA Resolver.` + err);
                }
             });

              child.on("exit", (code: any) => {
                log.debug(`Subprocess exit with ${code}.`); 
                log.debug('Finished SCA scan through SCA Resolver.');              
              }); 

          child.on('close', resolve);          
    });

    if (errorOccured !='') {
        throw  Error(`Error occurred while running SCA Resolver. ${errorOccured}`);
    }       
        
    }catch(err){
      let errMessage = '';
      errMessage = err.toString();  
      if(errMessage.includes('Permission denied') || errMessage.includes('Access is denied'))            
        {
          throw Error('Access was denied while attempting to execute the SCA Resolver command: ' + scaResolverCommand);
        }
        else{
          throw Error(`Error occurred while running SCA Resolver.`+err);
        }
    }
    return exitCode;    
}   

}