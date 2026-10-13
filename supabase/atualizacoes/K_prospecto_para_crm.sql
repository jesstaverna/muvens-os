-- MUVENS OS — 0019 Prospecto vai para o CRM automaticamente no 1º contato (e-mail enviado ou WhatsApp registrado)

create or replace function app.prospect_to_crm() returns trigger language plpgsql security definer set search_path = public as $$
declare v_stage uuid; v_lead uuid; v_msg record; v_obs text; v_pos int; v_target uuid; v_cur int;
begin
  -- 1º contato: cria (ou vincula) o lead no CRM, na etapa "Primeiro Contato" (2ª etapa aberta do funil)
  if new.status = 'contatado' and old.status is distinct from 'contatado' and new.lead_id is null and (new.email is not null or new.phone is not null) then
    select id into v_stage from public.pipeline_stages where active and kind = 'open' order by position offset 1 limit 1;
    if v_stage is null then select id into v_stage from public.pipeline_stages where active order by position limit 1; end if;
    select channel, subject, sent_at into v_msg from public.outreach_messages where prospect_id = new.id and status = 'enviada' order by sent_at desc nulls last limit 1;
    select string_agg('• ' || o, E'\n') into v_obs from jsonb_array_elements_text(coalesce(new.analysis->'observations', '[]'::jsonb)) o;
    begin
      insert into public.leads (name, company, phone, email, source, segment, stage_id, last_contact_at, next_action, notes)
      values (new.name, new.name, new.phone, new.email, case when new.source = 'google_maps' then 'Prospecção (Google Maps)' else 'Prospecção' end, new.category, v_stage, now(),
              'Acompanhar resposta do 1º contato', nullif(concat_ws(E'\n', case when new.score is not null then 'Pontuação de oportunidade: ' || new.score || '/100' end, v_obs), ''))
      returning id into v_lead;
    exception when unique_violation then
      select id into v_lead from public.leads where (new.email is not null and email_norm = app.norm_email(new.email)) or (new.phone is not null and phone_norm = app.norm_phone(new.phone)) limit 1;
    end;
    if v_lead is not null then
      new.lead_id := v_lead;
      insert into public.lead_interactions (lead_id, kind, content) values (v_lead, 'sistema',
        'Primeiro contato da prospecção: ' || case v_msg.channel when 'email' then 'e-mail enviado' when 'whatsapp_manual' then 'WhatsApp enviado' else 'contato registrado' end || coalesce(' ("' || v_msg.subject || '")', '') || '.');
    end if;
  end if;

  -- resposta do prospecto: o lead avança para "Qualificação" (3ª etapa aberta), se ainda estiver antes dela
  if new.status = 'respondeu' and old.status is distinct from 'respondeu' and new.lead_id is not null then
    select id, position into v_target, v_pos from public.pipeline_stages where active and kind = 'open' order by position offset 2 limit 1;
    select s.position into v_cur from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = new.lead_id;
    if v_target is not null and v_cur is not null and v_cur < v_pos then
      update public.leads set stage_id = v_target, next_action = 'Qualificar: entender dores e necessidades' where id = new.lead_id;
      insert into public.lead_interactions (lead_id, kind, content) values (new.lead_id, 'sistema', 'O prospecto respondeu à abordagem. Lead movido para Qualificação.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_prospects_to_crm on public.prospects;
create trigger trg_prospects_to_crm before update of status on public.prospects for each row execute function app.prospect_to_crm();

-- mensagens seguintes (follow-ups, WhatsApp) entram no histórico do lead
create or replace function app.outreach_to_lead_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead uuid;
begin
  if new.status = 'enviada' and old.status is distinct from 'enviada' then
    select lead_id into v_lead from public.prospects where id = new.prospect_id;
    if v_lead is not null then
      insert into public.lead_interactions (lead_id, kind, content) values (v_lead, case new.channel when 'email' then 'email' else 'whatsapp' end,
        (case when new.step = 1 then '1º contato' else 'Follow-up ' || (new.step - 1) end) || ' enviado por ' || case new.channel when 'email' then 'e-mail' else 'WhatsApp' end || coalesce(': "' || new.subject || '"', '') || '.');
      update public.leads set last_contact_at = now() where id = v_lead;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_outreach_to_lead_log on public.outreach_messages;
create trigger trg_outreach_to_lead_log after update of status on public.outreach_messages for each row execute function app.outreach_to_lead_log();
