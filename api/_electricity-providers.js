// Canonical Pairgate slugs, with the legacy dashboard/VTpass IDs accepted at the boundary.
export const electricityProviderAliases=Object.freeze({
 'ikeja-electric':'ikedc','eko-electric':'eko','abuja-electric':'aedc',
 'ibadan-electric':'ibedc','enugu-electric':'enugu','benin-electric':'benin',
 'kaduna-electric':'kaduna','kano-electric':'kedco','jos-electric':'jedc',
 'yola-electric':'yola','aba-electric':'aba','portharcourt-electric':'ph'
});
const canonical=new Set(['ikedc','eko','enugu','yola','benin','ph','aba','aedc','kaduna','kedco','ibedc','jedc']);
export function electricityProviderId(value){
 const id=typeof value==='string'?value.trim().toLowerCase():'';
 return canonical.has(id)?id: Object.hasOwn(electricityProviderAliases,id)?electricityProviderAliases[id]:null;
}
