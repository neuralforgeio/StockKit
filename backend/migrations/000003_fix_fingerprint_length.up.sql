-- PRD FR-AUTH-24 specifies fingerprint as sha256(UA) + ":" + sha256(IP),
-- which results in 64 + 1 + 64 = 129 characters.
-- The initial schema incorrectly constrained this to varchar(128).
ALTER TABLE refresh_families ALTER COLUMN fingerprint TYPE varchar(255);
