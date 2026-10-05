-- Applied after the initial schema in the dedicated production project.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
