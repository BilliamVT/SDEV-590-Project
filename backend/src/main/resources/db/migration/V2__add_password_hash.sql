-- Login (BILLIAMVT-20). Hash format is Spring Security's DelegatingPasswordEncoder,
-- e.g. "{bcrypt}$2a$10$...", so the algorithm can change later without a migration.
alter table app_user add column password_hash text not null;
