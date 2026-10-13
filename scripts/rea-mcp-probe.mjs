/* Uses the official REA SDK dependencies, never executes the supplied artifact. */
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {resolve,isAbsolute} from 'node:path';
const [packageRoot,target,output]=process.argv.slice(2);
if(!packageRoot||!target||!output||![packageRoot,target,output].every(isAbsolute))throw Error('Usage: node scripts/rea-mcp-probe.mjs ABS_REA_PACKAGE ABS_SAFE_ZIP ABS_OUTPUT_JSON');
const require=createRequire(resolve(packageRoot,'package.json'));
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client')));
const {StdioClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/client/stdio')));
const c=new Client({name:'arx-authorized-artifact-investigation',version:'1'});
const t=new StdioClientTransport({command:process.execPath,args:[resolve(packageRoot,'scripts/rea.mjs'),'mcp'],stderr:'pipe'});
try{
 await c.connect(t);const {tools}=await c.listTools();
 const open=tools.find(x=>x.name==='open_binary'),inspect=tools.find(x=>x.name==='inspect_artifact');
 if(!open||!inspect)throw Error('REA does not advertise the required tools');
 const opened=await c.callTool({name:open.name,arguments:{path:target}},{toolDefinition:open,timeout:60000});
 if(opened.isError)throw Error('REA could not open this authorized artifact');
 const result=await c.callTool({name:inspect.name,arguments:{}},{toolDefinition:inspect,timeout:60000});
 if(result.isError||!result.structuredContent?.evidence_id)throw Error('No successful evidence returned');
 await writeFile(output,JSON.stringify({server:c.getServerVersion(),tool:inspect.name,evidence:result.structuredContent},null,2)+'\n');
 console.log('Verified real MCP analysis:',result.structuredContent.evidence_id);
}finally{await c.close();}
