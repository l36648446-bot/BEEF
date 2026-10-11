const fs=require('fs'),vm=require('vm'),assert=require('assert');
class Element{constructor(){this.listeners={};this.children=[];this.textContent='';this.style={};this.dataset={};this.elements={customer:{value:''},month:{value:''},year:{value:''}}}set innerHTML(value){this.html=value}addEventListener(name,fn){this.listeners[name]=fn}append(c){this.children.push(c)}replaceChildren(){this.children=[]}querySelector(key){return this[key]??=(new Element())}querySelectorAll(key){return this[key]??=[Object.assign(new Element(),{dataset:{step:'1',delta:'1'}}),Object.assign(new Element(),{dataset:{step:'-1',delta:'-1'}})]}showModal(){this.open=true}close(){this.open=false}click(){this.onclick?.()}}
const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id)};
let openedLink;const context={document:{getElementById:get,createElement:tag=>{const element=new Element();if(tag==='a')element.click=()=>openedLink=element.href;return element},querySelector:get},FormData:class{constructor(form){this.data=form.data}get(name){return this.data[name]||''}},submitDelivery:async()=>{},setTimeout:()=>0,clearTimeout:()=>{},console};
vm.createContext(context);vm.runInContext(fs.readFileSync('products.js','utf8')+'\n'+fs.readFileSync('app.js','utf8'),context);
assert.equal(get('meat-grid').children.length,6);assert.equal(get('offer-grid').children.length,4);
const first=get('meat-grid').children[0];first.querySelector('.add').onclick();assert.equal(get('cart-count').textContent,1);assert.equal(get('total').textContent,'6.500 د.ك');
first.querySelectorAll('[data-step]')[0].onclick();first.querySelector('.add').onclick();assert.equal(get('cart-count').textContent,3);assert.equal(get('total').textContent,'19.500 د.ك');
get('cart-items').children[0].querySelectorAll('[data-delta]')[1].onclick();assert.equal(get('total').textContent,'13.000 د.ك');
first.querySelector('select').listeners.change({target:{value:'2'}});first.querySelector('.add').onclick();assert.equal(get('total').textContent,'38.500 د.ك');assert.equal(get('cart-items').children.length,2);
get('cart-items').children[0].querySelector('.remove').onclick();assert.equal(get('total').textContent,'25.500 د.ك');get('cart-items').children[0].querySelector('.remove').onclick();assert.equal(get('cart-count').textContent,0);assert.equal(get('total').textContent,'0.000 د.ك');
(async()=>{
 first.querySelector('.add').onclick();const form=get('order-form');
 const data={customer:'عميل تجربة',governorate:'حولي',address:''};form.data=data;
 await form.onsubmit({preventDefault(){},target:form});assert.ok(get('form-error').textContent);
 data.address='شارع 1';await form.onsubmit({preventDefault(){},target:form});
 assert.equal(get('details-dialog').open,true);assert.equal(get('details-form').elements.customer.value,'عميل تجربة');assert.equal(openedLink,undefined);
 console.log('Passed: cards, cart, totals, delivery validation and delivery submission before details step.');
})().catch(e=>{console.error(e);process.exitCode=1});