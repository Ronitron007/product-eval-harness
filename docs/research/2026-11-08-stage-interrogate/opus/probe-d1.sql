select current_user;
-- one round: draft, then a strict pass row (the judged round)
insert into harness.drafts (run_id, round, reply, drafter) values ('r1', 1, '{"a":1}', 'mock/drafter');
insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason)
  values ('r1', 1, 'x.strict_rule', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'strict', 'a', 'pass', '{"by":"code"}', 'ok');
begin;
insert into harness.run_ends (run_id, round, "end") values ('r1', 1, 'accepted');
insert into harness.outputs (run_id, stage, node_id, body, rule_set_hash, round) values ('r1','define_criteria','skincare','{"a":1}','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1);
commit;
-- after the end: a strict FAIL row for the accepted round
insert into harness.verdicts (run_id, round, rule_id, rule_version, rule_hash, binding, target, verdict, decider, reason)
  values ('r1', 1, 'x.strict_rule', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'strict', 'a', 'fail', '{"by":"code"}', 'late fail');
select e."end", o.round, string_agg(v.binding || ':' || v.verdict, ',' order by v.created_at) as rows_of_round
  from harness.run_ends e join harness.outputs o using (run_id, round) join harness.verdicts v using (run_id, round) group by 1,2;
