(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    const shell=document.querySelector('.staff-shell');
    const collapse=document.querySelector('.staff-collapse');
    if(collapse&&shell){collapse.addEventListener('click',()=>{shell.classList.toggle('sidebar-collapsed');collapse.textContent=shell.classList.contains('sidebar-collapsed')?'›':'‹';})}
  });
})();