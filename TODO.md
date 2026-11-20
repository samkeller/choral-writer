# Project

Project Description

<em>[TODO.md spec & Kanban Board](https://bit.ly/3fCwKfM)</em>

### Todo
- [ ] [MID][Back+Web][Après M6] Concevoir le cycle de vie et le budget des mémoires : péremption, fusion, résumés et sélection automatique des souvenirs. Comparer les stratégies sur des récits longs ; conserver la provenance, l'isolation des branches et une gestion explicite des faits critiques omis. Les périmètres de lecture configurés par agent font partie de M6, pas de ce TODO.
- [ ] [MID][Back] repenser fonctions accessoires api/src/App.ts:buildApp(), api/src/server.ts:main (plein de fonctions de ce genre - semblent accessoires) 
- [ ] [MID][Back+Web] Évaluer si la résolution factuelle doit devenir une étape distincte du Narrateur : mesurer son apport pour la continuité et la mémoire, son coût/latence et son impact sur les traces, puis décider de l’implémenter ou de supprimer la section dédiée.
- [ ] [HIGH] Pouvoir faire une nouvelle version/modifier un agent directement depuis l'interface projet/configuration (factoriser les composants qui existent déjà)
- [ ] [MID] il manque les tags des différentes étapes du pipeline dans projet/configuration, on peut vérifier le reste de l'application pour l'harmonisation de ce point.
- [ ] [MID][WEB] Il manque l'affichage des tags dans le select "Contrat de sortie" - la valeur sélectionnée devrait afficher le tag correspondant comme dans le picker, pas à côté !.
- [ ] [MID][WEB] Il n'est pas nécessaire de préciser Analyse - "Enveloppe whiteboard" pour typer un agent d'analyser, le tag "Analyse" suffit, tous sont en enveloppe whiteboard c'est un implicite. Contrairement aux agents de restitution dont "Propositions mémoire" ou "Réponse utilisateur" sont utiles pour les identifier - ici, le tag "Restitution" ne suffit pas.
- [ ] [MID][WEB] dans web/agentsn il est difficile d'identifier quel agent appartient à quel récit que ce soit pour le visualiser via des filtres ou pour agir directement sur un récit en cours
- [ ] [HIGH][Back+Web] Ajouter un constructeur automatiques d'agents/mémoires/tags/etc à la création d'un projet à partir du prompt système. Beaucoup d'informations du prompt sysyème seraient déplacées. Conception technique et fonctionnelle importante.
- [ ] [MID][Web] dans project/configuration permettre d'afficher les tags, afficher les agents concernés. Centraliser l'affichage des tags mémoires, pareils que dans le multiselect d'assignation a des agents.
- [ ] [MID][Web] Nouveau chat, ajouter Ctrl+Enter pour envoyer un nouveau message (c'est sur qu'on peut appliquer ce fonctionnement pour d'autres boutons d'actions de l'application, à vérifier)
- [ ] [MID][Web] Dans la page de chat, il faut harmoniser les messages de progrès/succes/erreur. Le composant PipelineProgress semble le plus indiqué pour tous ces états, il ne doit pas subsister de feedback utilisateur en dehors sauf si il existe une excellente raison fonctionnelle. La maquette de ce composant doit être facilement lisible par l'utilisateur.


### In Progress


### Done ✓

- [x] [MID][Web+Back] Typer strictement les retours de back (/shared) et parser tous les objets que le back envoie en types TS stricts. Eg: parse des strings http en dates quand ce sont des dates pour que le front puisse les utiliser out of the box. /web/api devrait reprendre la même structure de fichiers que les controllers back pour que ce soit le plus clair possible. Vérifier également que le back envoie toujours des DTO et pas des objets directs.
- [x] [MID][Web] Identité des phases harmonisée : tag partagé, icône et couleur propres à Analyse/Restitution, bibliothèque et configuration projet.
- [x] [MID][Web] Afficher les prompts en Markdown avec aperçu clampable et les réponses LLM en vue structurée/JSON, en réutilisant le rendu du whiteboard.

