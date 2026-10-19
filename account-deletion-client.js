(function(){
 const form=document.getElementById('deletionForm');if(!form)return;
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const button=form.querySelector('button[type=submit]'),status=document.getElementById('requestStatus');
  if(button.disabled)return;button.disabled=true;status.textContent='Sending your request…';
  try{
   const response=await fetch('/api/account-deletion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.elements.email.value.trim(),details:form.elements.details.value.trim(),confirmation:document.getElementById('confirm').checked?'DELETE MY ACCOUNT':''})});
   const data=await response.json();if(!response.ok||!data.success)throw Error(data.error||'Your request could not be sent. Please email support@lonerpay.com.');
   status.textContent='Request sent for review. Reference: '+data.reference+'\nSupport will verify ownership before deletion. This is not a deletion-completion confirmation.';
   form.querySelectorAll('input,textarea').forEach(el=>el.disabled=true);
  }catch(error){status.textContent=error.message||'We could not confirm delivery. Please email support@lonerpay.com or lonerhublimited@gmail.com.';button.disabled=false;}
 });
})();
