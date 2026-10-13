const fs=require('node:fs'),vm=require('node:vm');
for(const dir of ['.','companion','companion/qa'])for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync(dir+'/'+file,'utf8'),{filename:dir+'/'+file});
console.log('All application and Companion JavaScript files parse successfully');
