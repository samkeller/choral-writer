# Project

Project Description

<em>[TODO.md spec & Kanban Board](https://bit.ly/3fCwKfM)</em>

### Todo
- [ ] [MID][Back+Web][Après M6] Concevoir le cycle de vie et le budget des mémoires : péremption, fusion, résumés et sélection automatique des souvenirs. Comparer les stratégies sur des récits longs ; conserver la provenance, l'isolation des branches et une gestion explicite des faits critiques omis. Les périmètres de lecture configurés par agent font partie de M6, pas de ce TODO.
- [ ] [MID][Back] repenser fonctions accessoires api/src/App.ts:buildApp(), api/src/server.ts:main (plein de fonctions de ce genre - semblent accessoires) 
- [ ] [MID][Back+Web] Évaluer si la résolution factuelle doit devenir une étape distincte du Narrateur : mesurer son apport pour la continuité et la mémoire, son coût/latence et son impact sur les traces, puis décider de l’implémenter ou de supprimer la section dédiée.

### In Progress


### Done ✓

- [x] [MID][Web+Back] Typer strictement les retours de back (/shared) et parser tous les objets que le back envoie en types TS stricts. Eg: parse des strings http en dates quand ce sont des dates pour que le front puisse les utiliser out of the box. /web/api devrait reprendre la même structure de fichiers que les controllers back pour que ce soit le plus clair possible. Vérifier également que le back envoie toujours des DTO et pas des objets directs.
- [x] [MID][Web] Identité des phases harmonisée : tag partagé, icône et couleur propres à Analyse/Restitution, bibliothèque et configuration projet.
- [x] [MID][Web] Afficher les prompts en Markdown avec aperçu clampable et les réponses LLM en vue structurée/JSON, en réutilisant le rendu du whiteboard.

