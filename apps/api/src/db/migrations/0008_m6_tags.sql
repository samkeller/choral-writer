-- Routing tags preserve the exact v1 selected-reader predicate without granting
-- access to every entry in a scope. All work happens in the migration transaction.
CREATE TEMP TABLE m6_scopes (project_id uuid, id uuid, scope jsonb, priority integer) ON COMMIT DROP;
CREATE TEMP TABLE m6_routes (project_id uuid, agent_id uuid, tag_id uuid, read jsonb) ON COMMIT DROP;
CREATE TEMP TABLE m6_tags (project_id uuid, id uuid, tag jsonb, PRIMARY KEY (project_id, id)) ON COMMIT DROP;
--> statement-breakpoint
DO $$
DECLARE r record; s jsonb; read jsonb; route_tag_id uuid;
BEGIN
  -- Reject unknown or malformed versions instead of converting them to empty data.
  IF EXISTS (SELECT 1 FROM choral_writer.memory_settings WHERE catalog->'v' IS DISTINCT FROM '1'::jsonb AND catalog->'v' IS DISTINCT FROM '2'::jsonb)
    OR EXISTS (SELECT 1 FROM choral_writer.memory_bank WHERE entries->'v' IS DISTINCT FROM '1'::jsonb AND entries->'v' IS DISTINCT FROM '2'::jsonb)
    OR EXISTS (SELECT 1 FROM choral_writer.chat_turn WHERE memory_snapshot IS NOT NULL AND memory_snapshot->'v' IS DISTINCT FROM '1'::jsonb AND memory_snapshot->'v' IS DISTINCT FROM '2'::jsonb) THEN
    RAISE EXCEPTION 'Cannot migrate unknown memory document version';
  END IF;

  FOR r IN
    SELECT project_id, catalog AS doc, 0 AS priority FROM choral_writer.memory_settings WHERE catalog->'v' = '1'::jsonb
    UNION ALL
    SELECT project_id, memory_snapshot, 1 FROM choral_writer.chat_turn WHERE memory_snapshot->'v' = '1'::jsonb
  LOOP
    IF jsonb_typeof(r.doc->'scopes') IS DISTINCT FROM 'array' OR jsonb_typeof(r.doc->'templates') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Malformed legacy memory catalog for project %', r.project_id;
    END IF;
    FOR s IN SELECT value FROM jsonb_array_elements((r.doc->'scopes') || (r.doc->'templates')) LOOP
      IF jsonb_typeof(s->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(s->'name') IS DISTINCT FROM 'string'
        OR jsonb_typeof(s->'instructions') IS DISTINCT FROM 'string' OR jsonb_typeof(s->'writable') IS DISTINCT FROM 'boolean'
        OR (s ? 'archived' AND jsonb_typeof(s->'archived') IS DISTINCT FROM 'boolean') THEN
        RAISE EXCEPTION 'Malformed legacy scope in project %: %', r.project_id, s;
      END IF;
      PERFORM (s->>'id')::uuid;
    END LOOP;
    FOR s IN SELECT value FROM jsonb_array_elements(r.doc->'scopes') LOOP
      INSERT INTO m6_scopes VALUES (r.project_id, (s->>'id')::uuid, s, r.priority);
    END LOOP;
  END LOOP;

  FOR r IN SELECT project_id, agent_id, memory_read FROM choral_writer.project_agent WHERE memory_read IS NOT NULL AND NOT (memory_read ? 'tagIds') LOOP
    read := r.memory_read;
    IF read->>'mode' IS NULL OR read->>'mode' NOT IN ('none', 'all', 'selected')
      OR jsonb_typeof(read->'scopeIds') IS DISTINCT FROM 'array'
      OR jsonb_typeof(read->'tags') IS DISTINCT FROM 'array'
      OR jsonb_typeof(read->'keyPrefixes') IS DISTINCT FROM 'array'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(read->'scopeIds') x WHERE jsonb_typeof(x) <> 'string')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(read->'tags') x WHERE jsonb_typeof(x) <> 'string')
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(read->'keyPrefixes') x WHERE jsonb_typeof(x) <> 'string') THEN
      RAISE EXCEPTION 'Malformed legacy memory read for agent %', r.agent_id;
    END IF;
    -- Force UUID validation even when no entry matches.
    PERFORM x::uuid FROM jsonb_array_elements_text(read->'scopeIds') x;
    IF read->>'mode' = 'selected' THEN
      route_tag_id := md5('m6-reader:' || r.project_id::text || ':' || r.agent_id::text)::uuid;
      INSERT INTO m6_routes VALUES (r.project_id, r.agent_id, route_tag_id, read);
    END IF;
  END LOOP;

  INSERT INTO m6_tags
  -- PostgreSQL counts Unicode characters while JavaScript counts UTF-16 code
  -- units, so a conservative character limit also handles astral characters.
  SELECT project_id, id, jsonb_build_object('id', id, 'name', left(coalesce(nullif(regexp_replace(scope->>'name', '^[[:space:]]+|[[:space:]]+$', '', 'g'), ''), 'Scope'), 40) || ' [' || id::text || ']',
    'description', left(coalesce(nullif(regexp_replace(scope->>'instructions', '^[[:space:]]+|[[:space:]]+$', '', 'g'), ''), 'Legacy scope'), 1000))
  FROM (SELECT DISTINCT ON (project_id, id) * FROM m6_scopes ORDER BY project_id, id, priority, scope::text) scopes;
  -- A collision with a scope UUID must abort rather than change access.
  INSERT INTO m6_tags
  SELECT project_id, tag_id, jsonb_build_object('id', tag_id, 'name', 'Legacy reader [' || tag_id::text || ']',
    'description', 'Preserves a legacy agent memory filter.') FROM m6_routes;

  IF EXISTS (SELECT 1 FROM m6_tags GROUP BY project_id HAVING count(*) > 300) THEN
    RAISE EXCEPTION 'Cannot migrate memory: project exceeds 300 tags';
  END IF;
  -- Existing v2 catalogs are never rewritten. Mixed-version projects requiring
  -- missing tags cannot be safely migrated without modifying those catalogs.
  IF EXISTS (SELECT 1 FROM m6_tags t JOIN choral_writer.memory_settings s USING (project_id)
    WHERE s.catalog->'v' = '2'::jsonb AND NOT EXISTS
      (SELECT 1 FROM jsonb_array_elements(s.catalog->'tags') x WHERE x->>'id' = t.id::text)) THEN
    RAISE EXCEPTION 'Cannot migrate legacy memory alongside an incompatible v2 catalog';
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.m6_entries(p_project uuid, p_entries jsonb, p_scopes jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE e jsonb; s jsonb; tags jsonb; result jsonb := '[]'::jsonb; scope_id uuid;
BEGIN
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Malformed legacy entries for project %', p_project;
  END IF;
  IF jsonb_array_length(p_entries) > 2000 THEN
    RAISE EXCEPTION 'Cannot migrate memory: project % exceeds 2000 entries', p_project;
  END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    IF jsonb_typeof(e->'scopeId') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'tags') IS DISTINCT FROM 'array'
      OR jsonb_typeof(e->'archived') IS DISTINCT FROM 'boolean' OR jsonb_typeof(e->'key') IS DISTINCT FROM 'string'
      OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'content') IS DISTINCT FROM 'string'
      OR jsonb_typeof(e->'source') IS DISTINCT FROM 'string' OR e->>'source' NOT IN ('user', 'guardian')
      OR jsonb_typeof(e->'updatedAt') IS DISTINCT FROM 'string'
      OR NOT (e ? 'turnId') OR jsonb_typeof(e->'turnId') NOT IN ('string', 'null')
      OR length(btrim(e->>'key')) NOT BETWEEN 1 AND 200 OR length(btrim(e->>'content')) NOT BETWEEN 1 AND 32000
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(e->'tags') x WHERE jsonb_typeof(x) <> 'string') THEN
      RAISE EXCEPTION 'Malformed legacy entry for project %: %', p_project, e;
    END IF;
    PERFORM (e->>'id')::uuid, (e->>'turnId')::uuid, (e->>'updatedAt')::timestamptz;
    scope_id := (e->>'scopeId')::uuid;
    SELECT x INTO s FROM jsonb_array_elements(p_scopes) x WHERE (x->>'id')::uuid = scope_id LIMIT 1;
    IF s IS NULL THEN
      SELECT scope INTO s FROM m6_scopes WHERE project_id = p_project AND id = scope_id ORDER BY priority, scope::text LIMIT 1;
    END IF;
    IF s IS NULL THEN
      RAISE EXCEPTION 'Legacy entry references unknown scope % in project %; restore its metadata before migration', scope_id, p_project;
    END IF;
    SELECT jsonb_build_array(scope_id) || coalesce(jsonb_agg(route.tag_id ORDER BY route.tag_id) FILTER (WHERE route.tag_id IS NOT NULL), '[]'::jsonb)
      INTO tags FROM m6_routes route
      WHERE route.project_id = p_project
        AND NOT (e->>'archived')::boolean AND NOT coalesce((s->>'archived')::boolean, false)
        AND route.read->'scopeIds' @> jsonb_build_array(e->>'scopeId')
        AND ((jsonb_array_length(route.read->'tags') = 0 AND jsonb_array_length(route.read->'keyPrefixes') = 0)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(e->'tags') t WHERE route.read->'tags' ? t)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(route.read->'keyPrefixes') p WHERE left(e->>'key', length(p)) = p));
    IF jsonb_array_length(tags) > 100 THEN
      RAISE EXCEPTION 'Cannot migrate entry %: more than 100 routing tags', e->>'id';
    END IF;
    result := result || jsonb_build_array((e - 'scopeId' - 'tags') || jsonb_build_object(
      'tagIds', tags, 'protected', NOT (s->>'writable')::boolean,
      'archived', (e->>'archived')::boolean OR coalesce((s->>'archived')::boolean, false),
      'legacy', jsonb_build_object('scopeId', scope_id, 'scopeName', s->>'name',
        'scopeInstructions', s->>'instructions', 'tags', e->'tags')));
  END LOOP;
  RETURN result;
END $$;
--> statement-breakpoint
-- Convert entries before replacing the catalogs used to interpret them.
UPDATE choral_writer.memory_bank b SET entries = jsonb_build_object('v', 2, 'entries',
  pg_temp.m6_entries(b.project_id, b.entries->'entries', coalesce((SELECT s.catalog->'scopes' FROM choral_writer.memory_settings s WHERE s.project_id = b.project_id AND s.catalog->'v' = '1'::jsonb), '[]'::jsonb)))
WHERE b.entries->'v' = '1'::jsonb;
UPDATE choral_writer.chat_turn t SET memory_snapshot = jsonb_build_object('v', 2,
  'tags', coalesce((SELECT s.catalog->'tags' FROM choral_writer.memory_settings s WHERE s.project_id = t.project_id AND s.catalog->'v' = '2'::jsonb),
    (SELECT jsonb_agg(tag ORDER BY id) FROM m6_tags WHERE project_id = t.project_id), '[]'::jsonb),
  'entries', pg_temp.m6_entries(t.project_id, t.memory_snapshot->'entries', t.memory_snapshot->'scopes'),
  'legacy', jsonb_build_object('scopes', t.memory_snapshot->'scopes', 'templates', t.memory_snapshot->'templates'))
WHERE t.memory_snapshot->'v' = '1'::jsonb;
UPDATE choral_writer.memory_settings s SET catalog = jsonb_build_object('v', 2,
  'tags', coalesce((SELECT jsonb_agg(tag ORDER BY id) FROM m6_tags WHERE project_id = s.project_id), '[]'::jsonb),
  'legacy', jsonb_build_object('scopes', s.catalog->'scopes', 'templates', s.catalog->'templates'))
WHERE s.catalog->'v' = '1'::jsonb;
-- Missing settings can occur in older databases. Preserve recoverable metadata
-- from snapshots; unknown scope references have already caused an exception.
INSERT INTO choral_writer.memory_settings (project_id, revision_id, enabled, catalog)
SELECT p.id, gen_random_uuid(), false, jsonb_build_object('v', 2,
  'tags', coalesce((SELECT jsonb_agg(tag ORDER BY id) FROM m6_tags WHERE project_id = p.id), '[]'::jsonb))
  || coalesce((SELECT jsonb_build_object('legacy', t.memory_snapshot->'legacy') FROM choral_writer.chat_turn t
    WHERE t.project_id = p.id AND t.memory_snapshot ? 'legacy'
    ORDER BY t.created_at DESC, t.id DESC LIMIT 1), '{}'::jsonb)
FROM choral_writer.projects p
WHERE NOT EXISTS (SELECT 1 FROM choral_writer.memory_settings s WHERE s.project_id = p.id)
  AND (EXISTS (SELECT 1 FROM choral_writer.memory_bank b WHERE b.project_id = p.id)
    OR EXISTS (SELECT 1 FROM m6_tags t WHERE t.project_id = p.id));
UPDATE choral_writer.project_agent a SET memory_read = CASE
  WHEN a.memory_read IS NULL THEN jsonb_build_object('mode', CASE WHEN a.output = 'envelope' THEN 'none' ELSE 'all' END, 'tagIds', '[]'::jsonb)
  WHEN a.memory_read->>'mode' = 'selected' THEN jsonb_build_object('mode', 'selected', 'tagIds', jsonb_build_array(r.tag_id))
  ELSE jsonb_build_object('mode', a.memory_read->>'mode', 'tagIds', '[]'::jsonb) END
FROM (SELECT project_id, agent_id, tag_id FROM m6_routes UNION ALL
  SELECT project_id, agent_id, NULL::uuid FROM choral_writer.project_agent WHERE memory_read IS NULL OR (NOT (memory_read ? 'tagIds') AND memory_read->>'mode' <> 'selected')) r
WHERE a.project_id = r.project_id AND a.agent_id = r.agent_id;
DROP FUNCTION pg_temp.m6_entries(uuid, jsonb, jsonb);
DROP TABLE m6_tags, m6_routes, m6_scopes;
