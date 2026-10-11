const money=n=>(n/1000).toFixed(3)+' د.ك';
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cart=new Map();
const quantities=products.map(()=>1);
const selections=products.map(()=>0);
const dialog=document.getElementById('cart-dialog');
products.forEach((p,i)=>{
 const prices=p.variants.map(v=>v.price),min=Math.min(...prices),max=Math.max(...prices);
 const card=document.createElement('article');card.className='card';
 card.innerHTML=`<div class="photo"><img src="${p.image}" alt="${escapeHTML(p.name)}" loading="lazy">${p.oldPrice?'<span class="badge">عرض خاص</span>':''}</div><div class="card-body"><h3>${escapeHTML(p.name)}</h3><div class="range">${min===max?'سعر الوحدة':money(min)+' – '+money(max)}</div><label class="small" for="variant-${i}">الوزن والتجهيز</label><select id="variant-${i}" aria-label="خيارات ${escapeHTML(p.name)}">${p.variants.map((v,k)=>`<option value="${k}">${escapeHTML(v.name)} · ${money(v.price)}</option>`).join('')}</select><span class="price" id="price-${i}">${money(p.variants[0].price)}</span>${p.oldPrice?`<del>${money(p.oldPrice)}</del>`:''}<div class="buy-row"><div class="quantity"><button data-step="1" aria-label="زيادة كمية ${escapeHTML(p.name)}">+</button><output id="qty-${i}" aria-live="polite">1</output><button data-step="-1" aria-label="تقليل كمية ${escapeHTML(p.name)}">−</button></div><button class="add">أضف للسلة</button></div></div>`;
 card.querySelector('select').addEventListener('change',e=>{selections[i]=Number(e.target.value);document.getElementById('price-'+i).textContent=money(p.variants[selections[i]].price)});
 card.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{quantities[i]=Math.max(1,Math.min(99,quantities[i]+Number(b.dataset.step)));document.getElementById('qty-'+i).textContent=quantities[i]});
 card.querySelector('.add').onclick=()=>{const key=i+':'+selections[i];cart.set(key,Math.min(99,(cart.get(key)||0)+quantities[i]));renderCart();toast('تمت إضافة '+p.name+' إلى السلة')};
 document.getElementById(i<6?'meat-grid':'offer-grid').append(card);
});
let toastTimer;function toast(message){const t=document.getElementById('toast');t.textContent=message;t.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.style.display='none',2600)}
function rows(){return [...cart].map(([key,qty])=>{const [i,v]=key.split(':').map(Number);return{key,qty,product:products[i],variant:products[i].variants[v]}})}
function total(){return rows().reduce((sum,r)=>sum+r.qty*r.variant.price,0)}
function renderCart(){const list=document.getElementById('cart-items');list.replaceChildren();document.getElementById('cart-count').textContent=[...cart.values()].reduce((a,b)=>a+b,0);document.getElementById('total').textContent=money(total());if(!cart.size){list.innerHTML='<p class="small">سلتك فارغة. اختار المنتجات اللي تحبها وأضفها هنا.</p>'}rows().forEach(r=>{const item=document.createElement('div');item.className='cart-item';item.innerHTML=`<img src="${r.product.image}" alt="${escapeHTML(r.product.name)}"><div class="details"><strong>${escapeHTML(r.product.name)}</strong><small>${escapeHTML(r.variant.name)}</small><span>${money(r.variant.price*r.qty)}</span></div><div class="quantity"><button data-delta="1" aria-label="زيادة كمية ${escapeHTML(r.product.name)}">+</button><output>${r.qty}</output><button data-delta="-1" aria-label="تقليل كمية ${escapeHTML(r.product.name)}">−</button></div><button class="remove">حذف</button>`;item.querySelectorAll('[data-delta]').forEach(b=>b.onclick=()=>{const q=r.qty+Number(b.dataset.delta);if(q<1)cart.delete(r.key);else cart.set(r.key,Math.min(q,99));renderCart()});item.querySelector('.remove').onclick=()=>{cart.delete(r.key);renderCart()};list.append(item)});document.querySelector('.submit').disabled=!cart.size}
document.getElementById('open-cart').onclick=()=>{renderCart();dialog.showModal()};document.getElementById('close-cart').onclick=()=>dialog.close();
document.getElementById('order-form').onsubmit=async e=>{
 e.preventDefault();const error=document.getElementById('form-error');error.textContent='';
 if(!cart.size){error.textContent='أضف منتجاً إلى السلة أولاً.';return}
 const f=new FormData(e.target);
 if(!String(f.get('customer')).trim()||!String(f.get('address')).trim()){error.textContent='يرجى كتابة الاسم وعنوان التوصيل.';return}
 const button=e.target.querySelector('button[type="submit"]');button.disabled=true;
 try { await submitDelivery(f); showDetails(f); }
 catch(e) { error.textContent=e.message || 'تعذر إرسال بيانات التوصيل. حاول مرة أخرى.'; }
 finally { button.disabled=false; }
};
renderCart();
const detailsDialog=document.getElementById('details-dialog');
const detailsForm=document.getElementById('details-form');
let pendingOrder;
function showDetails(form){
 pendingOrder={form};
 detailsForm.elements.customer.value=form.get('customer');
 if(!detailsForm.elements.year.value){const now=new Date();detailsForm.elements.month.value=now.getMonth()+1;detailsForm.elements.year.value=now.getFullYear()}
 document.getElementById('details-error').textContent='';
 dialog.close();detailsDialog.showModal();detailsDialog.scrollTop=0;
}
document.getElementById('back-to-order').onclick=()=>{detailsDialog.close();dialog.showModal()};
document.getElementById('close-details').onclick=()=>detailsDialog.close();
detailsForm.onsubmit=async e=>{
 e.preventDefault();const details=new FormData(detailsForm),error=document.getElementById('details-error');
 const month=Number(details.get('month')),year=Number(details.get('year'));
 error.textContent='';
 if(!Number.isInteger(month)||month<1||month>12||!Number.isInteger(year)||year<1900||year>9999){error.textContent='أدخل تاريخاً صحيحاً بالأرقام: شهر / سنة.';return}
 if(!String(details.get('customer')).trim()){error.textContent='يرجى كتابة الاسم الكامل.';return}
 if(!pendingOrder||!cart.size){error.textContent='ارجع إلى السلة وأضف المنتجات أولاً.';return}
 const button=detailsForm.querySelector('button[type="submit"]');button.disabled=true;
 try { await submitForApproval(pendingOrder.form,details); }
 catch(e) { error.textContent=e.message || 'تعذر إرسال الطلب. حاول مرة أخرى.'; }
 finally { button.disabled=false; }
};
