import { describe, expect, it } from 'vitest';
import { plannedBudget, planProgress, validMarketingTab, validHttpUrl, type MarketingActivity } from './marketing';
const base:MarketingActivity={id:'1',plan_id:'p',kind:'campanha',title:'Mídia Meta',channel:'instagram_facebook',status:'planejado',description:'',cta:null,destination_url:null,format:null,planned_on:null,monthly_budget:800,utm_campaign:'muvens-diagnostico',created_at:'2026-11-17'};
describe('central de marketing',()=>{
 it('separa campanha de conteúdo e checklist',()=>{
  expect(plannedBudget([base,{...base,id:'2',kind:'conteudo',monthly_budget:500},{...base,id:'3',status:'pausado',monthly_budget:600}])).toBe(800);
 });
 it('calcula progresso só dos itens de preparação',()=>{
  expect(planProgress([{...base,kind:'checklist',status:'concluido'},{...base,id:'2',kind:'checklist',status:'planejado'},{...base,id:'3',kind:'criativo',status:'concluido'}])).toEqual({done:1,total:2});
 });
 it('limita abas e links seguros',()=>{
  expect(validMarketingTab('relatorios')).toBe('visao');
  expect(validMarketingTab('campanhas')).toBe('campanhas');
  expect(validHttpUrl('javascript:alert(1)')).toBeNull();
  expect(validHttpUrl('https://muvensagencia.com.br/diagnostico-gratuito')).toContain('muvensagencia.com.br');
 });
});
