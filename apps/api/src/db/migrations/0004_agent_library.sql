CREATE TYPE choral_writer.agent_phase AS ENUM ('analysis', 'restitution');
CREATE TYPE choral_writer.agent_output AS ENUM ('envelope', 'narrative', 'memory_proposals');
--> statement-breakpoint
ALTER TABLE choral_writer.agent RENAME TO legacy_agent;
ALTER TABLE choral_writer.legacy_agent RENAME CONSTRAINT agent_pkey TO legacy_agent_pkey;
ALTER INDEX choral_writer.agent_project_position_idx RENAME TO legacy_agent_project_position_idx;
--> statement-breakpoint
CREATE TABLE choral_writer.agent (
  id uuid PRIMARY KEY,
  phase choral_writer.agent_phase NOT NULL,
  output choral_writer.agent_output NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_id_contract_unique UNIQUE (id, phase, output),
  CONSTRAINT agent_phase_output_check CHECK (
    (phase = 'analysis' AND output = 'envelope') OR
    (phase = 'restitution' AND output IN ('narrative', 'memory_proposals'))
  )
);
CREATE TABLE choral_writer.agent_version (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES choral_writer.agent(id) ON DELETE CASCADE,
  version integer NOT NULL,
  name text NOT NULL,
  instructions text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_version_number_unique UNIQUE (agent_id, version),
  CONSTRAINT agent_version_owner_unique UNIQUE (agent_id, id)
);
CREATE TABLE choral_writer.project_agent (
  project_id uuid NOT NULL REFERENCES choral_writer.projects(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  version_id uuid NOT NULL,
  phase choral_writer.agent_phase NOT NULL,
  output choral_writer.agent_output NOT NULL,
  PRIMARY KEY (project_id, agent_id),
  CONSTRAINT project_agent_contract_fk FOREIGN KEY (agent_id, phase, output)
    REFERENCES choral_writer.agent(id, phase, output),
  CONSTRAINT project_agent_version_fk FOREIGN KEY (agent_id, version_id)
    REFERENCES choral_writer.agent_version(agent_id, id)
);
CREATE UNIQUE INDEX project_agent_required_output_unique
  ON choral_writer.project_agent(project_id, output) WHERE phase <> 'analysis';
--> statement-breakpoint
-- Preserve every legacy configuration, including disabled and unselected agents.
INSERT INTO choral_writer.agent(id, phase, output, created_at)
SELECT id,
  (CASE WHEN role = 'analysis' THEN 'analysis' ELSE 'restitution' END)::choral_writer.agent_phase,
  (CASE role WHEN 'analysis' THEN 'envelope' WHEN 'narrator' THEN 'narrative'
    WHEN 'guardian' THEN 'memory_proposals' END)::choral_writer.agent_output,
  created_at FROM choral_writer.legacy_agent;
INSERT INTO choral_writer.agent_version(id, agent_id, version, name, instructions, created_at)
SELECT id, id, 1, name, instructions, updated_at FROM choral_writer.legacy_agent;
INSERT INTO choral_writer.agent(id, phase, output) VALUES
  ('019aee00-0000-7000-8000-000000000001', 'restitution', 'narrative'),
  ('019aee00-0000-7000-8000-000000000002', 'restitution', 'memory_proposals');
INSERT INTO choral_writer.agent_version(id, agent_id, version, name, instructions) VALUES
  ('019aee00-0000-7000-8000-000000000001', '019aee00-0000-7000-8000-000000000001', 1, 'Narrateur', ''),
  ('019aee00-0000-7000-8000-000000000002', '019aee00-0000-7000-8000-000000000002', 1, 'Gardien', '');
INSERT INTO choral_writer.project_agent(project_id, agent_id, version_id, phase, output)
SELECT project_id, id, id, 'analysis', 'envelope'
FROM choral_writer.legacy_agent WHERE role = 'analysis' AND enabled;
INSERT INTO choral_writer.project_agent(project_id, agent_id, version_id, phase, output)
SELECT DISTINCT ON (l.project_id, l.role)
  l.project_id, l.id, l.id, a.phase, a.output
FROM choral_writer.legacy_agent l JOIN choral_writer.agent a ON a.id = l.id
WHERE l.role IN ('narrator', 'guardian') AND l.enabled
ORDER BY l.project_id, l.role, l.position, l.created_at, l.id;
INSERT INTO choral_writer.project_agent(project_id, agent_id, version_id, phase, output)
SELECT p.id, a.id, a.id, a.phase, a.output
FROM choral_writer.projects p CROSS JOIN choral_writer.agent a
WHERE a.id IN ('019aee00-0000-7000-8000-000000000001', '019aee00-0000-7000-8000-000000000002')
AND NOT EXISTS (
  SELECT 1 FROM choral_writer.project_agent pa WHERE pa.project_id = p.id AND pa.output = a.output
);
DROP TABLE choral_writer.legacy_agent;
--> statement-breakpoint
-- Allow atomic replacements, but require both restitution contracts at commit.
CREATE FUNCTION choral_writer.check_project_agent_outputs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    target := NEW.id;
  ELSE
    target := CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;
  END IF;
  IF EXISTS (SELECT 1 FROM choral_writer.projects WHERE id = target) AND (
    (SELECT count(*) FROM choral_writer.project_agent WHERE project_id = target AND output = 'narrative') <> 1
    OR (SELECT count(*) FROM choral_writer.project_agent WHERE project_id = target AND output = 'memory_proposals') <> 1
  ) THEN
    RAISE EXCEPTION 'Project requires exactly one narrative and one memory_proposals agent'
      USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'project_agent' AND TG_OP = 'UPDATE' THEN
    IF OLD.project_id <> NEW.project_id
      AND EXISTS (SELECT 1 FROM choral_writer.projects WHERE id = OLD.project_id) AND (
        (SELECT count(*) FROM choral_writer.project_agent WHERE project_id = OLD.project_id AND output = 'narrative') <> 1
        OR (SELECT count(*) FROM choral_writer.project_agent WHERE project_id = OLD.project_id AND output = 'memory_proposals') <> 1
      ) THEN
      RAISE EXCEPTION 'Source project requires both restitution contracts' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER project_agent_outputs_check
  AFTER INSERT OR UPDATE OR DELETE ON choral_writer.project_agent
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION choral_writer.check_project_agent_outputs();
CREATE CONSTRAINT TRIGGER project_initial_agents_check
  AFTER INSERT ON choral_writer.projects
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION choral_writer.check_project_agent_outputs();
--> statement-breakpoint
CREATE FUNCTION choral_writer.reject_agent_contract_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.phase <> OLD.phase OR NEW.output <> OLD.output THEN
    RAISE EXCEPTION 'Agent phase and output contract are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agent_contract_immutable BEFORE UPDATE ON choral_writer.agent
  FOR EACH ROW EXECUTE FUNCTION choral_writer.reject_agent_contract_change();
CREATE FUNCTION choral_writer.reject_agent_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published agent versions are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER agent_version_immutable BEFORE UPDATE ON choral_writer.agent_version
  FOR EACH ROW EXECUTE FUNCTION choral_writer.reject_agent_version_change();
