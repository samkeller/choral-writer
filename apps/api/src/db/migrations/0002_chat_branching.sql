-- Validate before changing the legacy model. Never silently discard orphaned
-- messages or infer a successful turn from an incomplete execution.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM choral_writer.turns t
    JOIN choral_writer.messages u ON u.id = t.user_message_id
    LEFT JOIN choral_writer.messages a ON a.id = t.assistant_message_id
    WHERE u.project_id <> t.project_id OR u.role <> 'user'
      OR (a.id IS NOT NULL AND (a.project_id <> t.project_id OR a.role <> 'assistant'))
      OR t.status NOT IN ('completed', 'failed')
      OR ((t.status = 'completed') <> (a.id IS NOT NULL))
  ) OR EXISTS (
    SELECT 1 FROM choral_writer.messages m
    WHERE NOT EXISTS (
      SELECT 1 FROM choral_writer.turns t
      WHERE t.user_message_id = m.id OR t.assistant_message_id = m.id
    )
  ) OR EXISTS (
    SELECT user_message_id FROM choral_writer.turns
    GROUP BY user_message_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot migrate inconsistent chat history; inspect legacy messages and turns first';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE choral_writer.messages RENAME TO chat_message;
ALTER TABLE choral_writer.turns RENAME TO chat_turn;
ALTER TABLE choral_writer.chat_message RENAME CONSTRAINT messages_pkey TO chat_message_pkey;
ALTER TABLE choral_writer.chat_turn RENAME CONSTRAINT turns_pkey TO chat_turn_pkey;
ALTER TABLE choral_writer.chat_message RENAME CONSTRAINT messages_project_id_projects_id_fk TO chat_message_project_id_projects_id_fk;
ALTER TABLE choral_writer.chat_turn RENAME CONSTRAINT turns_project_id_projects_id_fk TO chat_turn_project_id_projects_id_fk;
ALTER TABLE choral_writer.chat_turn DROP CONSTRAINT turns_user_message_id_messages_id_fk;
ALTER TABLE choral_writer.chat_turn DROP CONSTRAINT turns_assistant_message_id_messages_id_fk;
DROP INDEX choral_writer.messages_project_order_idx;
DROP INDEX choral_writer.turns_project_idx;
--> statement-breakpoint
CREATE TABLE choral_writer.chat_branch (
  id uuid PRIMARY KEY NOT NULL,
  project_id uuid NOT NULL,
  name text NOT NULL,
  source_branch_id uuid,
  fork_turn_id uuid,
  head_turn_id uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT chat_branch_project_id_unique UNIQUE (project_id, id)
);
ALTER TABLE choral_writer.projects ADD COLUMN default_branch_id uuid;
ALTER TABLE choral_writer.chat_turn ADD COLUMN origin_branch_id uuid;
ALTER TABLE choral_writer.chat_turn ADD COLUMN parent_turn_id uuid;
ALTER TABLE choral_writer.chat_turn ADD COLUMN retry_of_turn_id uuid;
ALTER TABLE choral_writer.chat_turn ADD COLUMN regenerated_from_turn_id uuid;
--> statement-breakpoint
-- Reuse each project's UUID only for the backfilled main branch. This preserves
-- UUID v7 without requiring a PostgreSQL extension or PostgreSQL 18's uuidv7().
INSERT INTO choral_writer.chat_branch (id, project_id, name, created_at)
SELECT id, id, 'Principale', created_at FROM choral_writer.projects;
UPDATE choral_writer.projects SET default_branch_id = id;
WITH ordered AS (
  SELECT t.id, t.project_id,
    lag(t.id) OVER (
      PARTITION BY t.project_id ORDER BY u.created_at, u.id, t.created_at, t.id
    ) AS parent_id
  FROM choral_writer.chat_turn t
  JOIN choral_writer.chat_message u ON u.id = t.user_message_id
)
UPDATE choral_writer.chat_turn t
SET origin_branch_id = o.project_id, parent_turn_id = o.parent_id
FROM ordered o WHERE t.id = o.id;
UPDATE choral_writer.chat_branch b
SET head_turn_id = (
  SELECT t.id FROM choral_writer.chat_turn t
  JOIN choral_writer.chat_message u ON u.id = t.user_message_id
  WHERE t.project_id = b.project_id
  ORDER BY u.created_at DESC, u.id DESC, t.created_at DESC, t.id DESC LIMIT 1
);
ALTER TABLE choral_writer.chat_turn ALTER COLUMN origin_branch_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE choral_writer.chat_message ADD CONSTRAINT chat_message_project_id_unique UNIQUE (project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_project_id_unique UNIQUE (project_id, id);
CREATE INDEX chat_message_project_idx ON choral_writer.chat_message (project_id);
CREATE INDEX chat_turn_project_idx ON choral_writer.chat_turn (project_id);
CREATE INDEX chat_branch_project_idx ON choral_writer.chat_branch (project_id);
ALTER TABLE choral_writer.chat_branch ADD CONSTRAINT chat_branch_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES choral_writer.projects(id) ON DELETE CASCADE;
ALTER TABLE choral_writer.chat_branch ADD CONSTRAINT chat_branch_source_fk FOREIGN KEY (project_id, source_branch_id) REFERENCES choral_writer.chat_branch(project_id, id);
ALTER TABLE choral_writer.chat_branch ADD CONSTRAINT chat_branch_fork_fk FOREIGN KEY (project_id, fork_turn_id) REFERENCES choral_writer.chat_turn(project_id, id);
ALTER TABLE choral_writer.chat_branch ADD CONSTRAINT chat_branch_head_fk FOREIGN KEY (project_id, head_turn_id) REFERENCES choral_writer.chat_turn(project_id, id);
ALTER TABLE choral_writer.projects ADD CONSTRAINT projects_default_chat_branch_fk FOREIGN KEY (id, default_branch_id) REFERENCES choral_writer.chat_branch(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_origin_branch_fk FOREIGN KEY (project_id, origin_branch_id) REFERENCES choral_writer.chat_branch(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_parent_fk FOREIGN KEY (project_id, parent_turn_id) REFERENCES choral_writer.chat_turn(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_retry_fk FOREIGN KEY (project_id, retry_of_turn_id) REFERENCES choral_writer.chat_turn(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_regenerated_fk FOREIGN KEY (project_id, regenerated_from_turn_id) REFERENCES choral_writer.chat_turn(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_user_message_fk FOREIGN KEY (project_id, user_message_id) REFERENCES choral_writer.chat_message(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_assistant_message_fk FOREIGN KEY (project_id, assistant_message_id) REFERENCES choral_writer.chat_message(project_id, id);
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_status_check CHECK (status IN ('running', 'completed', 'failed'));
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_response_check CHECK ((status = 'completed') = (assistant_message_id IS NOT NULL));
ALTER TABLE choral_writer.chat_turn ADD CONSTRAINT chat_turn_parent_check CHECK (parent_turn_id IS DISTINCT FROM id);
