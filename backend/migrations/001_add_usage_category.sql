-- Additive, non-destructive migration for FR-06 / MFCODE49
-- Adds usage_category for used water records.
-- Safe to run multiple times on MySQL 8.0+ (IF NOT EXISTS supported on ADD COLUMN in newer versions;
-- if your MySQL version does not support IF NOT EXISTS, ignore ER_DUP_FIELDNAME / duplicate column error).

ALTER TABLE water_records
  ADD COLUMN IF NOT EXISTS usage_category VARCHAR(50) NULL DEFAULT NULL;
