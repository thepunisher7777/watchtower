const fs=require('node:fs'),vm=require('node:vm');
for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});
console.log('All browser JavaScript files parse successfully');
