(()=>{
  'use strict';
  const button=document.getElementById('wdc-apply');
  if(!button)return;

  async function applyV021(event){
    const target=event.target?.closest?.('#wdc-apply');
    if(!target)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(!state?.result?.facts)return;
    const selected=Array.from(state.selectedFields||[]);
    if(!selected.length)return;
    const tab=await activeTab();if(!tab)return;

    target.disabled=true;target.textContent='Adding to BoldTrail…';
    await track('crm_write_started',{fields_count:selected.length,metadata:{field_mode:'semantic_fields_with_note_fallback'}});
    try{
      const res=await send(tab.id,{type:'WATCHDOG_APPLY_PROPERTY_V021',payload:{facts:state.result.facts,sources:state.result.sources||[],source_summary:state.result.source_summary,limitation:state.result.limitation,selected}});
      if(!res?.ok)throw new Error(res?.error||'write_failed');
      await track('crm_write_succeeded',{fields_count:selected.length,metadata:{field_mode:res.mode||'note'}});
      const count=Array.isArray(res.written)?res.written.length:0;
      if(res.note_written&&count)target.textContent=`Added ${count} field${count===1?'':'s'} + Watchdog note`;
      else if(res.note_written)target.textContent=res.note_duplicate?'Watchdog note already present':'Added Watchdog note';
      else target.textContent=count?`Added ${count} field${count===1?'':'s'}`:'Added to BoldTrail';
      status('Updated','good');
    }catch(_){
      await track('crm_write_failed',{fields_count:selected.length,metadata:{reason:'writer_v021_failed'}});
      target.textContent='Could not write safely';status('Nothing changed','bad');
    }finally{
      setTimeout(()=>{target.disabled=false;target.textContent='Add selected data to BoldTrail';},2600);
    }
  }

  document.addEventListener('click',applyV021,true);
})();
