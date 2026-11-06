import {tools} from './catalog.mjs';
export function mount(){
 const root=document.querySelector('[data-utility]');if(!root)return;
 const tool=tools.find(t=>t.slug===root.dataset.utility);if(!tool)return;
 const $=id=>document.getElementById(id),form=$('utility-form'),button=$('utility-submit');
 let ticket=0,url=null;
 const clear=()=>{
   ++ticket;$('utility-error').hidden=true;$('utility-result').hidden=true;
   $('utility-output').textContent='';$('utility-download').hidden=true;
   $('utility-image').hidden=true;$('utility-image').removeAttribute('src');
   $('utility-html').hidden=true;$('utility-html').srcdoc='';
   $('utility-download').removeAttribute('href');if(url){URL.revokeObjectURL(url);url=null;}
   button.disabled=false;button.textContent='결과 보기';
 };
 form.addEventListener('input',clear);form.addEventListener('change',clear);
 $('utility-reset').addEventListener('click',()=>{form.reset();clear();form.querySelector('input,select,textarea')?.focus();});
 form.addEventListener('submit',async event=>{
   event.preventDefault();clear();const current=ticket;
   button.disabled=true;button.textContent='처리 중…';
   try{
     const values={};
     for(const field of tool.fields){
       const input=form.elements.namedItem(field.name);
       values[field.name]=field.type==='file'?[...input.files]:input.value;
       if(field.required&&(field.type==='file'?!input.files.length:field.type==='select'?!input.value.length:!input.value.trim()))throw Error(field.label+'을(를) 입력해 주세요.');
       if(field.type==='number'){
         if(!Number.isFinite(input.valueAsNumber))throw Error(field.label+': 숫자를 입력해 주세요.');
         if(input.validity.rangeUnderflow)throw Error(field.label+': '+field.min+' 이상으로 입력하세요.');
         if(input.validity.rangeOverflow)throw Error(field.label+': '+field.max+' 이하로 입력하세요.');
         if(input.validity.stepMismatch)throw Error(field.label+': 입력 단위를 확인하세요.');
       }
       if(field.type==='file'&&[...input.files].some(f=>f.size>20*1024*1024))throw Error('파일당20MB 이하만 사용할 수 있습니다.');
       if(field.type!=='file'&&input.value.length>200000)throw Error('입력은20만 자 이하로 줄여 주세요.');
     }
     const result=await tool.run(values);
     if(current!==ticket)return;
     if(!result||typeof result.text!=='string')throw Error('결과를 만들지 못했습니다. 입력을 확인해 주세요.');
     $('utility-output').textContent=result.text;
     if(result.download){
       const d=result.download;
       url=URL.createObjectURL(d.content instanceof Blob?d.content:new Blob([d.content],{type:d.type}));
       $('utility-download').href=url;$('utility-download').download=d.name;$('utility-download').hidden=false;
       if(d.type.startsWith('image/')){$('utility-image').src=url;$('utility-image').hidden=false;}

     }
     if(typeof result.previewHtml==='string'){
       const policy="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'";
       $('utility-html').srcdoc='<meta http-equiv="Content-Security-Policy" content="'+policy+'">'+result.previewHtml;
       $('utility-html').hidden=false;
     }
     $('utility-result').hidden=false;$('utility-result').focus();
   }catch(error){
     if(current!==ticket)return;
     $('utility-error').textContent=error instanceof Error?error.message:'처리하지 못했습니다. 입력을 확인하세요.';
     $('utility-error').hidden=false;$('utility-error').focus();
   }finally{if(current===ticket){button.disabled=false;button.textContent='결과 보기';}}
 });
 button.disabled=false;
}
