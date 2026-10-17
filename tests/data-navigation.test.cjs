const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const html=fs.readFileSync(__dirname+'/../dashboard.html','utf8'),code=html.match(/<script id="lp-view-navigation">([\s\S]*?)<\/script>/)[1];
 const events={},tasks=[],pushes=[];let observer,back=0,state;
 const body={children:[],appendChild(n){n.remove();this.children.push(n);n.parent=this;}};
 function node(name,children=[]){return {name,tagName:'DIV',nodeType:1,childNodes:children,dataset:{},parent:null,replaceChildren(...c){this.childNodes=c;},remove(){if(this.parent){this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}},querySelector(){return null;}};}
 const context={location:{href:'https://lonerpay.com/dashboard.html'},document:{body,readyState:'complete',getElementById:id=>body.children.find(n=>n.id===id),addEventListener:(k,f)=>events[k]=f},window:{scrollY:0,scrollTo(){},addEventListener:(k,f)=>events[k]=f},history:{replaceState(s){state=s;},pushState(s){state=s;pushes.push(s);},back(){back++;},go(){}},getComputedStyle:()=>({position:'fixed',display:'flex',visibility:'visible',top:'0px',bottom:'0px'}),MutationObserver:class{constructor(f){observer=f;}observe(){}},setTimeout:f=>{tasks.push(f);}};
 vm.runInNewContext(code,context);const flush=()=>{while(tasks.length)tasks.shift()();};
 const view=node('data',[node('catalogue')]);view.id='lpLiveData';body.appendChild(view);observer();flush();
 function click(kind,label){const target={textContent:label,className:kind==='back'?'ld-close ld-back':'',getAttribute:()=>null,id:'',matches:s=>s==='.ld-continue'?kind==='continue':s==='#lpLiveData .ld-back'?kind==='back':false,closest:s=>s==='#lpLiveData'?view:s==='#lpBusinessHub'?null:target};const e={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};events.click(e);return e;}
 return {view,node,pushes,events,click,flush,mutate(){observer();flush();},backCount:()=>back,body};
}
test('network and bundle choices do not add extra Back steps',()=>{const s=setup(),count=s.pushes.length;s.click('plan','1GB');s.view.replaceChildren(s.node('selected catalogue'));s.mutate();assert.equal(s.pushes.length,count);s.click('network','Airtel');s.view.replaceChildren(s.node('Airtel catalogue'));s.mutate();assert.equal(s.pushes.length,count);});
test('Continue adds one review step and browser Back restores the catalogue node',()=>{const s=setup(),catalogue=s.view.childNodes[0],count=s.pushes.length;s.click('continue','Continue');s.view.replaceChildren(s.node('review'));s.mutate();assert.equal(s.pushes.length,count+1);s.events.popstate({state:{lpViewNavigation:1}});assert.equal(s.view.childNodes[0],catalogue);});
test('header Back arrow uses the same previous step as footer Back',()=>{const s=setup();const e=s.click('back','Back to data bundles');assert.equal(s.backCount(),1);assert.equal(e.stopped,true);});
test('Back cannot leave an in-flight payment and permit another submission',()=>{const s=setup();s.view.dataset.paymentBusy='1';const e=s.click('back','Back');assert.equal(s.backCount(),0);assert.equal(e.stopped,true);});
