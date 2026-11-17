-- Publish defaults without mutating existing versions or project assignments.
WITH defaults(id, agent_id, name, instructions) AS (
  VALUES
    ('019aee00-0000-7000-8000-000000000003'::uuid, '019aee00-0000-7000-8000-000000000001'::uuid,
      'Narrateur', 'Produis toujours une restitution pertinente à partir du contexte disponible. Ne laisse jamais ta réponse vide, même si les informations sont limitées. Sois créatif.'),
    ('019aee00-0000-7000-8000-000000000004'::uuid, '019aee00-0000-7000-8000-000000000002'::uuid,
      'Gardien', 'Examine toujours le contexte et retourne une réponse structurée. Ne laisse jamais ta sortie vide : retourne une liste vide si aucune proposition pertinente n''est à faire.')
)
INSERT INTO choral_writer.agent_version(id, agent_id, version, name, instructions)
SELECT d.id, d.agent_id,
  (SELECT coalesce(max(v.version), 0) + 1 FROM choral_writer.agent_version v WHERE v.agent_id = d.agent_id),
  d.name, d.instructions
FROM defaults d;