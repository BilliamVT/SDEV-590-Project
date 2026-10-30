-- Invite codes for joining a household (BILLIAMVT-37, decision record 0005).
-- One code per household; members can replace it, which stops the old one working.
-- Stored uppercase without separators (e.g. K7QM3XRP); the app shows it as K7QM-3XRP.
alter table household add column invite_code text;

-- Households created before this migration get a random code; members can regenerate it
update household set invite_code = upper(substr(md5(random()::text || id::text), 1, 8)) where invite_code is null;

alter table household alter column invite_code set not null;
alter table household add constraint household_invite_code_key unique (invite_code);
