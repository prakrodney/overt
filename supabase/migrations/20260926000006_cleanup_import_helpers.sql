-- Overt · cleanup after switching to the database-side importer
-- Removes one-off helpers used during the first import and archives points
-- that were loaded before the US-boundary filter existed.

-- Temporary first-run helpers (created ad hoc, now unused).
drop function if exists private.queue_next_initial_region();
drop table if exists private.initial_queue;

-- Per-region edge-function trigger, replaced by private.start_region_fetch().
drop function if exists private.queue_import(text);

-- Points outside the US (from the earliest bounding-box load) stay in the
-- table for history but stop showing on the map.
select private.archive_points_outside_us();
